"""Answers "can we make this batch now?" -- the one place this question
is computed, reused by the production detail page's Readiness section,
the production list's per-row indicator, and the PLANNED -> IN PROGRESS
start gate (see production_service.change_status). Composes existing
services rather than duplicating their math:

  bom_service            - active BOM + scaled component requirements
  inventory_service      - on-hand/reserved/available per material
  raw_material_alternative_service - approved alternatives for a short material
  supplier_material_service        - procurement info for a short material
  capacity_service       - machine/worker capacity within the batch's window

Nothing here decides what to purchase (that's MRP) or substitutes
materials automatically (that's always an explicit user choice recorded
on the batch's actual consumption, never on the BOM itself).
"""

from datetime import date

from sqlalchemy.orm import Session, joinedload

from app.core.exceptions import NotFoundError, ValidationAppError
from app.models.machine import Machine
from app.models.product import Product
from app.models.production_schedule import ProductionSchedule
from app.models.raw_material import RawMaterial
from app.services import bom_service, capacity_service, inventory_service, settings_service
from app.services import raw_material_alternative_service, supplier_material_service

# Same statuses production_schedule's own booked-capacity check counts
# against a machine/worker pool -- see capacity_service.
BOOKED_PRODUCTION_STATUSES = capacity_service.BOOKED_PRODUCTION_STATUSES


def _material_alternatives(db: Session, raw_material_id: int) -> list[dict]:
    alternatives = [
        a for a in raw_material_alternative_service.get_alternatives(db, raw_material_id) if a.status == "approved"
    ]
    alternatives.sort(key=lambda a: a.priority)
    results = []
    for alt in alternatives:
        material = alt.alternative_material
        if material is None or material.status != "active":
            continue
        stock = inventory_service.get_stock(db, "raw_material", alt.alternative_material_id)
        results.append(
            {
                "raw_material_id": alt.alternative_material_id,
                "code": material.code,
                "name": material.name,
                "unit": material.unit,
                "conversion_ratio": float(alt.conversion_ratio),
                "priority": alt.priority,
                "status": alt.status,
                "on_hand": stock["quantity_on_hand"],
                "available": stock["quantity_available"],
            }
        )
    return results


def _material_procurement(db: Session, raw_material_id: int) -> dict | None:
    """Preferred supplier if one's set, else the lowest-priced active
    one -- same fallback RawMaterialDetailPage's own summary already
    uses client-side; computed here too since this payload is meant to
    be read directly, not recomputed by whoever's showing it."""
    links = [
        s for s in supplier_material_service.get_suppliers_for_material(db, raw_material_id) if s.status == "active"
    ]
    if not links:
        return None
    chosen = next((s for s in links if s.is_preferred), None)
    if chosen is None:
        chosen = min(links, key=lambda s: float(s.purchase_price))
    return {
        "supplier_id": chosen.supplier_id,
        "supplier_code": chosen.supplier.code,
        "supplier_name": chosen.supplier.name,
        "is_preferred": chosen.is_preferred,
        "purchase_price": float(chosen.purchase_price),
        "currency": chosen.currency,
        "moq": float(chosen.moq),
        "lead_time_days": chosen.lead_time_days,
    }


def _check_materials(
    db: Session, product_id: int, quantity: float, exclude_reservation: dict[int, float] | None
) -> list[dict]:
    detailed = bom_service.explode_requirements_detailed(db, product_id, quantity)
    if not detailed:
        return []

    materials = {
        m.id: m for m in db.query(RawMaterial).filter(RawMaterial.id.in_(detailed.keys())).all()
    }
    exclude_reservation = exclude_reservation or {}
    results = []
    for raw_material_id, req in sorted(detailed.items(), key=lambda kv: kv[0]):
        material = materials.get(raw_material_id)
        required = round(req["scrap_inflated_required"], 4)
        stock = inventory_service.get_stock(db, "raw_material", raw_material_id)
        # A batch's own existing reservation is netted back into its own
        # availability -- otherwise a batch would always look short
        # against the exact amount it already reserved for itself (see
        # check_batch_readiness).
        available = round(stock["quantity_available"] + exclude_reservation.get(raw_material_id, 0.0), 4)
        shortage = round(max(0.0, required - available), 4)
        safety_stock = float(material.safety_stock) if material else 0.0
        entry = {
            "raw_material_id": raw_material_id,
            "code": material.code if material else f"#{raw_material_id}",
            "name": material.name if material else "Unknown material",
            "unit": material.unit if material else "",
            "required": required,
            "on_hand": stock["quantity_on_hand"],
            "reserved": stock["quantity_reserved"],
            "available": available,
            "shortage": shortage,
            "safety_stock": safety_stock,
            "safety_stock_warning": safety_stock > 0 and (available - required) < safety_stock,
            "alternatives": [],
            "procurement": None,
        }
        if shortage > 0:
            entry["alternatives"] = _material_alternatives(db, raw_material_id)
            entry["procurement"] = _material_procurement(db, raw_material_id)
        results.append(entry)
    return results


def _check_machine_and_workers(
    db: Session,
    product: Product,
    quantity: float,
    machine_id: int | None,
    scheduled_start: date | None,
    scheduled_end: date | None,
    exclude_batch_id: int | None,
) -> tuple[dict | None, dict | None]:
    """Whether the batch's own (fixed) scheduled window has enough free
    machine/worker capacity, net of every other booked batch in that
    window -- not an open-ended "when could this run" scan (see
    capacity_service.capacity_available_in_window). None/None when the
    product has no machine/time formula at all (not evaluable, same
    "not evaluable" stance feasibility_service takes) or no schedule
    window was given yet (e.g. a not-yet-created batch).
    """
    if product.production_hours_per_unit is None or scheduled_start is None or scheduled_end is None:
        return None, None

    working_days = settings_service.get_working_days(db)
    required_hours = round(float(quantity) * float(product.production_hours_per_unit), 4)

    def _booked(query_filters: list) -> dict[date, float]:
        batches = (
            db.query(ProductionSchedule)
            .options(joinedload(ProductionSchedule.product))
            .filter(*query_filters)
            .all()
        )
        if exclude_batch_id is not None:
            batches = [b for b in batches if b.id != exclude_batch_id]
        return batches

    machine_result = None
    effective_machine_id = machine_id or product.machine_id
    if effective_machine_id is not None:
        machine = db.query(Machine).filter(Machine.id == effective_machine_id).first()
        if machine is not None:
            machine_batches = _booked([
                ProductionSchedule.machine_id == machine.id,
                ProductionSchedule.deleted_at.is_(None),
                ProductionSchedule.status.in_(BOOKED_PRODUCTION_STATUSES),
                ProductionSchedule.scheduled_end >= scheduled_start,
                ProductionSchedule.scheduled_start <= scheduled_end,
            ])
            daily_booked = capacity_service.daily_booked_hours(machine_batches, hours_field="machine")
            available_hours = capacity_service.capacity_available_in_window(
                float(machine.capacity_hours_per_day), daily_booked, scheduled_start, scheduled_end, working_days
            )
            machine_result = {
                "machine_id": machine.id,
                "machine_code": machine.code,
                "machine_name": machine.name,
                "required_hours": required_hours,
                "available_hours": round(available_hours, 4),
                "ok": available_hours >= required_hours,
            }

    workers_result = None
    workers_required = product.workers_required
    if workers_required:
        total_workers, workday_hours = settings_service.get_factory_labor_pool(db)
        if total_workers > 0:
            required_worker_hours = round(required_hours * workers_required, 4)
            worker_batches = _booked([
                ProductionSchedule.deleted_at.is_(None),
                ProductionSchedule.status.in_(BOOKED_PRODUCTION_STATUSES),
                ProductionSchedule.scheduled_end >= scheduled_start,
                ProductionSchedule.scheduled_start <= scheduled_end,
            ])
            worker_daily_booked = capacity_service.daily_booked_hours(worker_batches, hours_field="workers")
            available_worker_hours = capacity_service.capacity_available_in_window(
                total_workers * workday_hours, worker_daily_booked, scheduled_start, scheduled_end, working_days
            )
            workers_result = {
                "workers_required": workers_required,
                "required_hours": required_worker_hours,
                "available_hours": round(available_worker_hours, 4),
                "ok": available_worker_hours >= required_worker_hours,
            }
        # else: workers required but no factory-wide pool configured --
        # not evaluable, same as feasibility_service's stance; leave
        # workers_result as None rather than silently passing it.

    return machine_result, workers_result


def _summarize(materials: list[dict], machine: dict | None, workers: dict | None) -> tuple[str, str]:
    material_shortage = any(m["shortage"] > 0 for m in materials)
    machine_conflict = machine is not None and not machine["ok"]
    worker_shortage = workers is not None and not workers["ok"]

    issues = [
        name
        for name, present in (
            ("MATERIAL_SHORTAGE", material_shortage),
            ("MACHINE_CONFLICT", machine_conflict),
            ("WORKER_SHORTAGE", worker_shortage),
        )
        if present
    ]

    if not issues:
        return "READY", "All materials, machine time, and worker capacity are available."

    if len(issues) > 1:
        labels = {
            "MATERIAL_SHORTAGE": f"{sum(1 for m in materials if m['shortage'] > 0)} material(s) short",
            "MACHINE_CONFLICT": "machine time unavailable",
            "WORKER_SHORTAGE": "worker capacity unavailable",
        }
        return "MULTIPLE_ISSUES", ", ".join(labels[i] for i in issues)

    status = issues[0]
    if status == "MATERIAL_SHORTAGE":
        short = [m for m in materials if m["shortage"] > 0]
        summary = "Short: " + ", ".join(f"{m['name']} ({m['shortage']} {m['unit']})" for m in short)
    elif status == "MACHINE_CONFLICT":
        summary = (
            f"{machine['machine_name']} has only {machine['available_hours']}h free in this window, "
            f"needs {machine['required_hours']}h."
        )
    else:
        summary = (
            f"Worker pool has only {workers['available_hours']}h free in this window, "
            f"needs {workers['required_hours']}h."
        )
    return status, summary


def check_readiness(
    db: Session,
    *,
    product: Product,
    quantity: float,
    scheduled_start: date | None = None,
    scheduled_end: date | None = None,
    machine_id: int | None = None,
    exclude_batch_id: int | None = None,
    exclude_reservation: dict[int, float] | None = None,
) -> dict:
    """The core, reusable readiness computation. `product` is the
    already-loaded Product ORM row. `exclude_batch_id`/`exclude_reservation`
    are only set when checking an *existing* batch's own readiness (see
    check_batch_readiness below) -- they keep that batch's own booking
    and reservation from counting against itself.
    """
    if not bom_service.has_bom(db, product.id):
        return {
            "status": "NO_ACTIVE_BOM",
            "product_id": product.id,
            "quantity": quantity,
            "bom_id": None,
            "bom_number": None,
            "output_quantity": None,
            "materials": [],
            "machine": None,
            "workers": None,
            "summary": "This product has no active BOM -- nothing to check materials, machine, or worker time against.",
        }

    header = bom_service.get_bom_header(db, product.id)
    materials = _check_materials(db, product.id, quantity, exclude_reservation)
    machine, workers = _check_machine_and_workers(
        db, product, quantity, machine_id, scheduled_start, scheduled_end, exclude_batch_id
    )
    status, summary = _summarize(materials, machine, workers)

    return {
        "status": status,
        "product_id": product.id,
        "quantity": quantity,
        "bom_id": header.id if header else None,
        "bom_number": header.bom_number if header else None,
        "output_quantity": float(header.output_quantity) if header else None,
        "materials": materials,
        "machine": machine,
        "workers": workers,
        "summary": summary,
    }


def _own_reservation(db: Session, batch: ProductionSchedule) -> dict[int, float]:
    """How much `batch` itself currently holds reserved, per raw
    material -- recomputed fresh from its own product/quantity (there's
    no per-batch ledger of reservations, only the aggregate
    quantity_reserved column) rather than read back from anywhere, the
    same assumption _release_batch_materials already relies on.
    """
    if batch.status not in ("planned", "in_progress"):
        return {}
    if not bom_service.has_bom(db, batch.product_id):
        return {}
    return bom_service.explode_requirements(db, batch.product_id, float(batch.planned_quantity))


def check_batch_readiness(db: Session, batch_id: int) -> dict:
    """Readiness for an existing batch, using its own product/quantity/
    schedule/machine -- excludes the batch's own reservation and its own
    booking from the material and machine/worker checks respectively, so
    it never looks like it conflicts with itself."""
    batch = (
        db.query(ProductionSchedule)
        .options(joinedload(ProductionSchedule.product))
        .filter(ProductionSchedule.id == batch_id, ProductionSchedule.deleted_at.is_(None))
        .first()
    )
    if batch is None:
        raise NotFoundError("Production batch")
    if batch.product is None:
        raise ValidationAppError("This batch's product could not be loaded.")

    return check_readiness(
        db,
        product=batch.product,
        quantity=float(batch.planned_quantity),
        scheduled_start=batch.scheduled_start,
        scheduled_end=batch.scheduled_end,
        machine_id=batch.machine_id,
        exclude_batch_id=batch.id,
        exclude_reservation=_own_reservation(db, batch),
    )


def quick_status(db: Session, batch: ProductionSchedule) -> str | None:
    """Just the overall status string, for the production list's
    per-row indicator -- only meaningful for a batch still 'planned'
    (once started/completed/cancelled, "can we start" is moot)."""
    if batch.status != "planned":
        return None
    return check_batch_readiness(db, batch.id)["status"]
