from datetime import date, timedelta

from sqlalchemy.orm import Session, joinedload

from app.core.timezone import today_kuwait
from app.models.order import Order
from app.models.production_schedule import ProductionSchedule
from app.models.purchase_order import PurchaseOrder, PurchaseOrderLine
from app.models.raw_material import RawMaterial
from app.models.supplier import Supplier
from app.models.supplier_material import SupplierMaterial
from app.services import bom_service, inventory_service, production_execution_service, settings_service

# Orders in these statuses still need their goods produced/shipped, so
# they're live demand. draft isn't included (not yet committed),
# shipped/delivered/cancelled aren't (already fulfilled or moot).
OUTSTANDING_ORDER_STATUSES = ("confirmed", "in_production", "ready_to_ship")

# Batches in these statuses represent already-decided future production
# runs -- the most concrete demand signal there is, since someone
# explicitly scheduled them (see production_service.py). 'paused' still
# counts -- it's stalled, not abandoned, and still needs its remaining
# quantity produced. No filter on production_order_id: a legacy batch
# and a Production-Order-driven schedule (P2-P5) are equally real,
# already-decided demand, just tagged differently in each source's own
# `source_type` (see _demand_sources) for traceability.
SCHEDULED_BATCH_STATUSES = ("planned", "in_progress", "paused")

# A purchase order in any of these statuses hasn't finished delivering
# yet -- its still-outstanding lines (quantity - received_quantity)
# count as confirmed incoming stock. Mirrors purchase_order_service.
# auto_draft_from_mrp_shortages's own already_pending status tuple;
# duplicated rather than imported to avoid a circular import (that
# module already imports this one).
OPEN_PO_STATUSES = ("draft", "sent", "confirmed", "partially_received")


def _demand_sources(db: Session) -> list[dict]:
    """Every individual source of finished-goods demand -- one entry per
    scheduled batch (legacy or Production-Order-driven) plus one entry
    per outstanding order line that has no batch scheduled against its
    order at all yet -- kept separate rather than pooled per product, so
    each raw-material requirement it explodes into (see
    _raw_material_requirements_by_source) can still be traced back to
    exactly what created it: which production order/batch/customer
    order, and by when it's needed.

    An order with a batch scheduled is assumed covered by that batch for
    this purpose, even if the batch's quantity doesn't exactly match the
    order line -- getting that reconciliation exactly right needs
    partial-fulfillment tracking this schema doesn't have yet. Good
    enough for a first MRP pass; refine later if batches routinely
    under-schedule against their order.
    """
    sources: list[dict] = []

    # Fetched unfiltered by status (beyond excluding cancelled/deleted),
    # not just the "still outstanding" statuses -- a Production-Order-
    # linked row's own `status` column never advances off 'planned' on
    # its own (see get_effective_schedule_state's docstring), so filtering
    # in SQL on the raw column would silently keep counting a batch
    # that's actually long since completed. The real status/quantity for
    # each row is resolved below instead, and only rows whose *effective*
    # status is still outstanding are kept.
    candidate_batches = (
        db.query(ProductionSchedule)
        .options(joinedload(ProductionSchedule.product), joinedload(ProductionSchedule.production_order))
        .filter(
            ProductionSchedule.status != "cancelled",
            ProductionSchedule.deleted_at.is_(None),
        )
        .all()
    )
    effective = production_execution_service.get_effective_schedule_state(db, candidate_batches)
    batches = [b for b in candidate_batches if effective[b.id]["status"] in SCHEDULED_BATCH_STATUSES]
    batched_order_ids = {b.order_id for b in batches if b.order_id}
    for batch in batches:
        # What's actually still outstanding on this batch -- not its full
        # planned_quantity -- now that a batch can carry partial output
        # from one or more log_partial_production calls (e.g. paused
        # partway through), or, for a Production-Order-linked batch, one
        # or more completed ProductionExecution runs. A freshly planned/
        # in_progress batch with nothing recorded yet still contributes
        # its full amount, same as before.
        remaining = max(float(batch.planned_quantity) - effective[batch.id]["produced_quantity"], 0.0)
        if remaining <= 0:
            continue
        po = batch.production_order
        required_by = batch.planned_start.date() if batch.planned_start else batch.scheduled_start
        sources.append(
            {
                "product_id": batch.product_id,
                "product_name": batch.product.name if batch.product else None,
                "quantity": remaining,
                "source_type": "production_order" if po is not None else "legacy_batch",
                "schedule_id": batch.id,
                "batch_number": batch.batch_number,
                "production_order_id": po.id if po else None,
                "production_order_number": po.production_order_number if po else None,
                "order_id": None,
                "order_number": None,
                "required_by_date": required_by,
            }
        )

    orders_query = db.query(Order).options(joinedload(Order.lines)).filter(
        Order.status.in_(OUTSTANDING_ORDER_STATUSES),
        Order.deleted_at.is_(None),
    )
    if batched_order_ids:
        orders_query = orders_query.filter(~Order.id.in_(batched_order_ids))

    for order in orders_query.all():
        required_by = order.confirmed_delivery_date or order.requested_delivery_date
        for line in order.lines:
            stock = inventory_service.get_stock(db, "product", line.product_id)
            still_needed = max(0.0, float(line.quantity) - stock["quantity_on_hand"])
            if still_needed <= 0:
                continue
            sources.append(
                {
                    "product_id": line.product_id,
                    "product_name": line.product.name if line.product else None,
                    "quantity": still_needed,
                    "source_type": "order",
                    "schedule_id": None,
                    "batch_number": None,
                    "production_order_id": None,
                    "production_order_number": None,
                    "order_id": order.id,
                    "order_number": order.order_number,
                    "required_by_date": required_by,
                }
            )

    return sources


def _raw_material_requirements_by_source(db: Session, sources: list[dict]) -> dict[int, list[dict]]:
    """Explodes each demand source's own quantity through its product's
    BOM separately (bom_service.explode_requirements, already returning
    each raw material's quantity converted into that material's own
    unit) -- never pooled by product first, so every resulting
    requirement row still carries the source that created it. Summing
    each source's own exploded amount is mathematically identical to
    pooling quantities per product before exploding (BOM explosion is
    linear in quantity), so this changes nothing about the totals, only
    adds traceability."""
    result: dict[int, list[dict]] = {}
    for source in sources:
        if source["quantity"] <= 0:
            continue
        exploded = bom_service.explode_requirements(db, source["product_id"], source["quantity"])
        for raw_material_id, required_qty in exploded.items():
            if required_qty <= 0:
                continue
            result.setdefault(raw_material_id, []).append({**source, "required_quantity": required_qty})
    return result


def _open_incoming_by_material(db: Session) -> dict[int, list[dict]]:
    """Still-outstanding quantity (quantity - received_quantity) on every
    non-cancelled line of a still-open purchase order, per raw material
    -- this is "confirmed incoming stock" (already committed to a
    supplier, just not landed yet), distinct from a fresh suggestion
    this pass might make for whatever's still uncovered after it."""
    rows = (
        db.query(PurchaseOrderLine, PurchaseOrder)
        .join(PurchaseOrder, PurchaseOrderLine.purchase_order_id == PurchaseOrder.id)
        .options(joinedload(PurchaseOrderLine.purchase_order))
        .filter(
            PurchaseOrder.deleted_at.is_(None),
            PurchaseOrder.status.in_(OPEN_PO_STATUSES),
            PurchaseOrderLine.is_cancelled.is_(False),
        )
        .all()
    )
    result: dict[int, list[dict]] = {}
    for line, po in rows:
        remaining = round(float(line.quantity) - float(line.received_quantity), 4)
        if remaining <= 0:
            continue
        result.setdefault(line.raw_material_id, []).append(
            {
                "purchase_order_id": po.id,
                "po_number": po.po_number,
                "supplier_name": po.supplier.name if po.supplier else None,
                "quantity": remaining,
                "expected_delivery_date": po.expected_delivery_date,
                "status": po.status,
            }
        )
    return result


def suggest_purchases(db: Session, raw_material_id: int, shortfall: float) -> tuple[list[dict], float]:
    """Greedily allocates the shortfall across known suppliers of this
    material, fastest lead time first, respecting each supplier's
    max_supply_quantity. Returns (suggestions, uncovered_quantity).

    Public (not the module-private helper it used to be) because
    feasibility_service reuses this exact selection -- same supplier
    data, same fastest-lead-time-first ordering, same tie-break -- to
    project a material-availability date for a genuine shortfall. One
    supplier-selection algorithm, two callers, so MRP's purchase
    suggestions and feasibility's projected dates can never disagree
    about which supplier would actually be used.
    """
    supplier_lines = (
        db.query(SupplierMaterial)
        .join(Supplier, SupplierMaterial.supplier_id == Supplier.id)
        .filter(
            SupplierMaterial.raw_material_id == raw_material_id,
            SupplierMaterial.deleted_at.is_(None),
            Supplier.deleted_at.is_(None),
            Supplier.status == "active",
        )
        # MariaDB has never implemented ANSI NULLS LAST syntax (unlike
        # PostgreSQL, or MySQL 8.0.13+) -- SQLAlchemy's .nulls_last()
        # compiles straight through to that keyword rather than
        # emulating it, which fails outright on MariaDB. This achieves
        # the same ordering portably: NULL sorts as boolean True (1),
        # so "is this NULL" ascending puts every non-NULL row first,
        # then lead_time_days breaks ties among those.
        .order_by(SupplierMaterial.lead_time_days.is_(None), SupplierMaterial.lead_time_days.asc())
        .all()
    )

    remaining = shortfall
    suggestions: list[dict] = []
    for line in supplier_lines:
        if remaining <= 0:
            break
        take = min(remaining, float(line.max_supply_quantity))
        suggestions.append(
            {
                "supplier_id": line.supplier_id,
                "supplier_code": line.supplier.code,
                "supplier_name": line.supplier.name,
                "quantity": take,
                "lead_time_days": line.lead_time_days,
                "mode_of_supply": line.supplier.mode_of_supply,
            }
        )
        remaining -= take
    return suggestions, max(0.0, remaining)


def _expected_available_date(
    today: date, working_days: set[int], shortfall: float, incoming: list[dict], suggestions: list[dict], uncovered: float
) -> tuple[bool, date | None]:
    """When the full requirement will actually be in hand -- either
    already covered by incoming stock already on order (the latest of
    those POs' own expected_delivery_date), or projected from a fresh
    suggestion's supplier lead time the same way feasibility_service's
    own per-line projection already does (SLA lead time, then rolled
    forward to the next working day, since goods landing don't become
    usable stock the same day). Returns (date_known, date) -- date_known
    is False (no fabricated date) whenever that can't be honestly
    established: an unfilled gap remains, a used supplier has no
    recorded lead time, or an incoming PO has no expected_delivery_date
    of its own.
    """
    if shortfall <= 0:
        if not incoming:
            return True, today
        known_dates = [i["expected_delivery_date"] for i in incoming if i["expected_delivery_date"]]
        if len(known_dates) == len(incoming):
            return True, max(known_dates)
        return False, None

    if uncovered <= 0 and suggestions and all(s["lead_time_days"] is not None for s in suggestions):
        material_lead_days = max(s["lead_time_days"] for s in suggestions)
        return True, settings_service.next_working_day(today + timedelta(days=material_lead_days), working_days)

    return False, None


def compute_requirements(db: Session) -> list[dict]:
    """The full MRP pass: demand -> BOM explosion -> net against
    available stock and confirmed incoming purchase orders -> supplier
    suggestions for whatever gap remains, for every raw material with a
    requirement exceeding what's on hand. Read-only -- nothing here
    persists anything, it's computed fresh every call, so a purchase
    order being received (raising on-hand stock and dropping out of
    "incoming") is reflected automatically on the very next call, never
    a stale cached shortage.

    A material still appears here even once confirmed incoming stock
    fully covers the gap (fully_covered_by_incoming=True, shortfall=0)
    -- so a person checking MRP sees "this is already handled by PO
    #123", not silence that could be mistaken for "nothing needed".
    """
    sources = _demand_sources(db)
    by_material = _raw_material_requirements_by_source(db, sources)
    if not by_material:
        return []

    materials = {
        m.id: m
        for m in db.query(RawMaterial).filter(RawMaterial.id.in_(by_material.keys())).all()
    }
    incoming_by_material = _open_incoming_by_material(db)
    today = today_kuwait()
    working_days = settings_service.get_working_days(db)

    results: list[dict] = []
    for raw_material_id, source_list in by_material.items():
        total_required = round(sum(s["required_quantity"] for s in source_list), 4)
        stock = inventory_service.get_stock(db, "raw_material", raw_material_id)
        available = stock["quantity_available"]
        gross_shortfall = max(0.0, round(total_required - available, 4))
        if gross_shortfall <= 0:
            continue

        incoming = incoming_by_material.get(raw_material_id, [])
        confirmed_incoming_quantity = round(sum(i["quantity"] for i in incoming), 4)
        shortfall = max(0.0, round(gross_shortfall - confirmed_incoming_quantity, 4))

        material = materials.get(raw_material_id)
        suggestions, uncovered = suggest_purchases(db, raw_material_id, shortfall)
        date_known, expected_available_date = _expected_available_date(
            today, working_days, shortfall, incoming, suggestions, uncovered
        )

        for source in source_list:
            required_by = source["required_by_date"]
            source["at_risk"] = bool(
                required_by is not None
                and (not date_known or (expected_available_date is not None and required_by < expected_available_date))
            )

        results.append(
            {
                "raw_material_id": raw_material_id,
                "code": material.code if material else f"#{raw_material_id}",
                "name": material.name if material else "Unknown material",
                "unit": material.unit if material else "",
                "reorder_point": float(material.reorder_point) if material else 0.0,
                "total_required": total_required,
                "available_quantity": available,
                "confirmed_incoming_quantity": confirmed_incoming_quantity,
                "incoming_purchase_orders": incoming,
                "shortfall": shortfall,
                "uncovered_quantity": uncovered,
                "fully_covered": uncovered <= 0,
                "fully_covered_by_incoming": shortfall <= 0,
                "date_known": date_known,
                "expected_available_date": expected_available_date,
                "suggested_purchases": suggestions,
                "sources": source_list,
            }
        )

    results.sort(key=lambda r: r["shortfall"], reverse=True)
    return results


def group_by_source(requirements: list[dict]) -> list[dict]:
    """Inverts compute_requirements' per-material `sources` breakdown
    into one row per demand source (production order, legacy batch, or
    customer order line) -- the same underlying data, grouped the other
    way, so the MRP report can also answer "what is THIS production
    order still short on" instead of only "what is short across every
    source". Pure grouping over already-computed rows -- no new queries.
    """
    groups: dict[tuple, dict] = {}
    order_key = []
    for req in requirements:
        for source in req["sources"]:
            if source["source_type"] == "production_order":
                key = ("production_order", source["production_order_id"])
                label = source["production_order_number"]
            elif source["source_type"] == "legacy_batch":
                key = ("legacy_batch", source["schedule_id"])
                label = source["batch_number"]
            else:
                key = ("order", source["order_id"])
                label = source["order_number"]

            group = groups.get(key)
            if group is None:
                group = {
                    "source_type": source["source_type"],
                    "id": key[1],
                    "label": label,
                    "product_id": source["product_id"],
                    "product_name": source["product_name"],
                    "required_by_date": source["required_by_date"],
                    "at_risk": False,
                    "materials": [],
                }
                groups[key] = group
                order_key.append(key)
            group["at_risk"] = group["at_risk"] or source["at_risk"]
            group["materials"].append(
                {
                    "raw_material_id": req["raw_material_id"],
                    "code": req["code"],
                    "name": req["name"],
                    "unit": req["unit"],
                    "required_quantity": round(source["required_quantity"], 4),
                    "shortfall": req["shortfall"],
                    "fully_covered": req["fully_covered"],
                }
            )

    result = [groups[key] for key in order_key]
    result.sort(key=lambda g: (not g["at_risk"], g["required_by_date"] or date.max))
    return result
