import json
from datetime import date

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.core.exceptions import AppError, ConflictError, NotFoundError, ValidationAppError
from app.core.pagination import sort_and_paginate
from app.core.timezone import now_kuwait_naive, today_kuwait
from app.core.workflow import assert_reason_given, assert_transition_allowed, assert_within_backdate_window
from app.models.machine import Machine
from app.models.order import OPEN_STATUSES, Order, OrderDetail
from app.models.product import Product
from app.models.production_schedule import ALLOWED_TRANSITIONS, ProductionSchedule
from app.models.raw_material import RawMaterial
from app.services import (
    audit_service,
    bom_service,
    deal_service,
    inventory_service,
    number_series_service,
    production_readiness_service,
    raw_material_alternative_service,
)

TABLE_NAME = "production_schedules"

# How far produced_quantity can drift from planned_quantity on
# completion before it counts as a genuine discrepancy requiring a
# reason -- just enough to absorb floating-point/rounding noise on a
# DECIMAL(14,4) column, not a real under/over-run.
QUANTITY_DISCREPANCY_TOLERANCE = 1e-4


def _base_query(db: Session, include_deleted: bool = False):
    query = db.query(ProductionSchedule).options(
        joinedload(ProductionSchedule.product),
        joinedload(ProductionSchedule.machine),
        joinedload(ProductionSchedule.order),
    )
    if not include_deleted:
        query = query.filter(ProductionSchedule.deleted_at.is_(None))
    return query


def get_batch(
    db: Session, batch_id: int, include_deleted: bool = False, for_update: bool = False
) -> ProductionSchedule:
    if for_update:
        # Plain, unjoined lock query -- see order_service.get_order's
        # for_update branch for why _base_query's joinedloads can't be
        # combined with with_for_update().
        query = db.query(ProductionSchedule).filter(ProductionSchedule.id == batch_id)
        if not include_deleted:
            query = query.filter(ProductionSchedule.deleted_at.is_(None))
        obj = query.with_for_update().first()
    else:
        obj = _base_query(db, include_deleted).filter(ProductionSchedule.id == batch_id).first()
    if obj is None:
        raise NotFoundError("Production batch")
    return obj


_SORTABLE_FIELDS = {
    "batch_number": ProductionSchedule.batch_number,
    "scheduled_start": ProductionSchedule.scheduled_start,
    "scheduled_end": ProductionSchedule.scheduled_end,
    "status": ProductionSchedule.status,
    "created_at": ProductionSchedule.created_at,
}


def list_batches(
    db: Session,
    page: int = 1,
    page_size: int = 10,
    search: str | None = None,
    status: str | None = None,
    product_id: int | None = None,
    order_id: int | None = None,
    sort: str | None = None,
    readiness: str | None = None,
    overdue: bool | None = None,
) -> dict:
    query = _base_query(db)

    if status:
        query = query.filter(ProductionSchedule.status == status)
    if product_id:
        query = query.filter(ProductionSchedule.product_id == product_id)
    if order_id:
        query = query.filter(ProductionSchedule.order_id == order_id)
    if search:
        query = query.filter(ProductionSchedule.batch_number.ilike(f"%{search}%"))
    if overdue:
        # Same condition escalate_overdue_batches flags for admin review
        # -- past its expected completion date and not yet closed out
        # one way or another, whatever its current status.
        query = query.filter(
            ProductionSchedule.status.notin_(("completed", "cancelled")),
            ProductionSchedule.scheduled_end < today_kuwait(),
        )

    if readiness:
        # Readiness isn't a stored column (see production_readiness_service)
        # and only ever applies to 'planned' batches -- filtering by it means
        # recomputing per candidate instead of pushing into SQL, scoped to
        # 'planned' rows so the candidate set stays to whatever's actually
        # still awaiting a start decision rather than the whole table.
        return _list_planned_by_readiness(db, query, readiness, sort, page, page_size)

    return sort_and_paginate(query, ProductionSchedule, _SORTABLE_FIELDS, sort, page, page_size)


def _list_planned_by_readiness(
    db: Session, query, readiness: str, sort: str | None, page: int, page_size: int
) -> dict:
    query = query.filter(ProductionSchedule.status == "planned")
    candidates = sort_and_paginate(query, ProductionSchedule, _SORTABLE_FIELDS, sort, page=1, page_size=10_000)["items"]

    wanted = readiness.strip().upper()
    if wanted == "READY":
        matched = [b for b in candidates if production_readiness_service.quick_status(db, b) == "READY"]
    else:  # "BLOCKED" -- anything checked and not READY
        matched = [b for b in candidates if production_readiness_service.quick_status(db, b) not in (None, "READY")]

    page = max(page, 1)
    page_size = min(max(page_size, 1), 200)
    start = (page - 1) * page_size
    total = len(matched)
    return {
        "items": matched[start : start + page_size],
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size if page_size else 0,
    }


def check_readiness_for_candidate_batch(
    db: Session,
    product_id: int,
    quantity: float,
    scheduled_start: date | None = None,
    scheduled_end: date | None = None,
    machine_id: int | None = None,
) -> dict:
    """The same materials/machine/worker readiness check an existing
    batch's own GET /{batch_id}/readiness runs, but for a batch that
    doesn't exist yet -- lets the "New batch" form show machine
    availability and worker requirement vs. available *before* the user
    commits to a schedule, instead of only finding out via a
    ConflictError after submitting. production_readiness_service.
    check_readiness already takes a plain product/quantity/window/
    machine rather than requiring a real batch row, so this is just the
    product lookup in front of it.
    """
    product = _validate_product(db, product_id)
    return production_readiness_service.check_readiness(
        db,
        product=product,
        quantity=quantity,
        scheduled_start=scheduled_start,
        scheduled_end=scheduled_end,
        machine_id=machine_id,
    )


def _reject_production_order_linked(batch: ProductionSchedule) -> None:
    """Guards every write path in this module that assumes it owns the
    batch's raw-material reservation (update_batch/delete_batch/
    restore_batch/change_status all call _reserve_batch_materials/
    _release_batch_materials unconditionally) -- a schedule created
    through the Production Order flow (P5, production_order_id set)
    never reserved anything itself, so releasing "whatever it should
    have reserved" here would incorrectly claw back stock that's still
    legitimately held by that Production Order's own Material Allocation
    (P4). Such a schedule must only be edited/rescheduled/cancelled
    through production_order_schedule_service, which knows this and
    never touches inventory.
    """
    if batch.production_order_id is not None:
        raise ConflictError(
            "This schedule belongs to a Production Order; manage it from the Production Order's "
            "own schedule instead."
        )


def _validate_product(db: Session, product_id: int) -> Product:
    product = (
        db.query(Product).filter(Product.id == product_id, Product.deleted_at.is_(None)).first()
    )
    if product is None:
        raise ValidationAppError(f"Product {product_id} not found.")
    # P11: this legacy auto-scheduled-batch flow had no active-product
    # check at all -- mirrors production_order_service._get_active_
    # product's check for the newer Production Order flow.
    if product.status != "active":
        raise ValidationAppError(f"{product.name} is inactive and cannot be planned for production.")
    return product


def _validate_machine(db: Session, machine_id: int) -> Machine:
    """P11: create_batch/update_batch had no machine validation at all --
    a deactivated machine could still be booked for a real batch that
    reserves raw material. Mirrors production_order_schedule_service.
    create_schedule's own machine check for the newer Production Order
    flow."""
    machine = db.query(Machine).filter(Machine.id == machine_id, Machine.deleted_at.is_(None)).first()
    if machine is None:
        raise ValidationAppError(f"Machine {machine_id} not found.")
    if machine.status != "active":
        raise ValidationAppError(f"{machine.name} is inactive and cannot be scheduled.")
    return machine


def _validate_order(db: Session, order_id: int) -> Order:
    order = db.query(Order).filter(Order.id == order_id, Order.deleted_at.is_(None)).first()
    if order is None:
        raise ValidationAppError(f"Order {order_id} not found.")
    return order


def _reserve_batch_materials(db: Session, batch: ProductionSchedule) -> None:
    """Locks the raw materials this batch's planned run will need, the
    moment the batch becomes a real commitment on the calendar --
    machine time is already locked by the batch occupying a booked slot
    (see capacity_service.BOOKED_PRODUCTION_STATUSES), and finished-goods
    stock is locked by order_service.reserve_stock on order confirmation;
    this is the raw-material half of the same "requirement locked once
    committed" guarantee. Without it, a batch could sit scheduled for
    days while its materials were freely consumed by something else, and
    the shortfall would only surface as a hard failure at the moment of
    completion (see _record_output) -- too late to do anything but block
    a batch that was supposedly already ready to run.

    A product with no BOM configured has nothing to reserve -- same
    "not evaluable" stance as everywhere else this distinction matters
    (feasibility_service's capacity check, _record_output's shortfall
    check). Reservations are allowed to exceed on-hand quantity, same as
    finished-goods reservation -- a shortfall here is exactly the
    MRP/purchasing signal, not something to block batch creation over.
    """
    if not bom_service.has_bom(db, batch.product_id):
        return
    requirements = bom_service.explode_requirements(db, batch.product_id, float(batch.planned_quantity))
    for raw_material_id, required_qty in requirements.items():
        if required_qty > 0:
            inventory_service.reserve_stock(
                db, "raw_material", raw_material_id, required_qty,
                reference_type="production_schedule", reference_id=batch.id,
            )


def _release_reservation_for_quantity(
    db: Session, batch: ProductionSchedule, quantity: float, commit: bool = True
) -> None:
    """Releases the raw-material reservation for exactly `quantity` worth
    of `batch`'s product -- the shared primitive both full and partial
    release build on. `quantity` <= 0 is a no-op (e.g. a batch cancelled
    or edited before ever reserving anything).
    """
    if quantity <= 0 or not bom_service.has_bom(db, batch.product_id):
        return
    requirements = bom_service.explode_requirements(db, batch.product_id, quantity)
    for raw_material_id, required_qty in requirements.items():
        if required_qty > 0:
            inventory_service.release_reservation(
                db, "raw_material", raw_material_id, required_qty,
                reference_type="production_schedule", reference_id=batch.id, commit=commit,
            )


def _release_batch_materials(db: Session, batch: ProductionSchedule, commit: bool = True) -> None:
    """Symmetric release of _reserve_batch_materials -- called on every
    path where a batch stops holding a claim on raw materials outright:
    deleted while still planned, edited to a different product/quantity
    (releases the old figures before the new ones are reserved), or
    finally closed out one way or another (completed or cancelled).
    Always recomputes from the batch's own current product_id/
    planned_quantity rather than a stored snapshot, so it exactly mirrors
    whatever _reserve_batch_materials most recently reserved for this
    batch.

    Releases only what's still outstanding -- planned_quantity minus
    whatever's already been produced (and had its own slice of the
    reservation released) via log_partial_production -- not the full
    planned_quantity every time. For a batch that's never had any partial
    output recorded (produced_quantity is still 0, true for every caller
    except a completion/cancellation that followed one or more pauses),
    that's the same as releasing the full amount, exactly as before this
    distinction existed.

    commit=False -- see inventory_service.adjust_stock's docstring; used
    by change_status, which holds a lock on the batch row for the whole
    call and needs every stock movement folded into its own single commit.
    """
    remaining = float(batch.planned_quantity) - float(batch.produced_quantity)
    _release_reservation_for_quantity(db, batch, remaining, commit=commit)


def get_material_requirements(db: Session, batch_id: int) -> list[dict]:
    """The per-raw-material breakdown for whatever this batch still has
    left to run -- planned_quantity minus anything already recorded via
    log_partial_production -- net (zero-scrap) requirement, the
    scrap-inflated figure still held in reserve for it, and current
    stock. Used by the "Log production" / "Complete batch" screen
    alongside an actual-quantity input per material. Purely a read;
    entering nothing for a material when actually recording output means
    it's deducted at the scrap-inflated figure shown here, same as
    before this existed. Falls back to planned_quantity itself once
    nothing remains (produced_quantity caught up to or passed it),
    e.g. for a completed batch's own history view.
    """
    batch = get_batch(db, batch_id)
    remaining = float(batch.planned_quantity) - float(batch.produced_quantity)
    quantity_for_display = remaining if remaining > 0 else float(batch.planned_quantity)
    detailed = bom_service.explode_requirements_detailed(db, batch.product_id, quantity_for_display)
    if not detailed:
        return []

    materials = {
        m.id: m for m in db.query(RawMaterial).filter(RawMaterial.id.in_(detailed.keys())).all()
    }
    results = []
    for raw_material_id, req in detailed.items():
        material = materials.get(raw_material_id)
        stock = inventory_service.get_stock(db, "raw_material", raw_material_id)
        results.append(
            {
                "raw_material_id": raw_material_id,
                "code": material.code if material else f"#{raw_material_id}",
                "name": material.name if material else "Unknown material",
                "unit": material.unit if material else "",
                "net_required": round(req["net_required"], 4),
                "planned_required": round(req["scrap_inflated_required"], 4),
                "current_on_hand": stock["quantity_on_hand"],
            }
        )
    results.sort(key=lambda r: r["code"])
    return results


def _assert_no_duplicate_scheduling(
    db: Session, order_id: int, product_id: int, planned_quantity: float, exclude_batch_id: int | None = None
) -> None:
    """Blocks scheduling more against an order line than it actually
    still needs -- see get_order_product_quantity_summary's own
    docstring for how 'remaining' is derived. Without this, nothing
    stopped several batches from independently covering the same
    already-satisfied quantity (each individually valid, but jointly
    scheduling more than the order line could ever need)."""
    summary = get_order_product_quantity_summary(db, order_id, product_id, exclude_batch_id=exclude_batch_id)
    if summary["ordered"] <= 0:
        # Not actually a line on this order -- _validate_order/
        # _validate_product already gate the order/product existing at
        # all; nothing further to guard here.
        return
    if planned_quantity > summary["remaining"] + 1e-6:
        raise ConflictError(
            f"This order's line for this product only has {summary['remaining']} unit(s) still "
            f"unsatisfied ({summary['produced']} produced and {summary['scheduled']} already scheduled "
            f"against {summary['ordered']} ordered) -- {planned_quantity} would over-schedule it."
        )


def create_batch(db: Session, data: dict, user_id: int | None = None) -> ProductionSchedule:
    product = _validate_product(db, data["product_id"])
    order = None
    if data.get("order_id"):
        order = _validate_order(db, data["order_id"])
        _assert_no_duplicate_scheduling(db, data["order_id"], data["product_id"], float(data["planned_quantity"]))
    if not data.get("machine_id"):
        data["machine_id"] = product.machine_id
    if data.get("machine_id"):
        _validate_machine(db, data["machine_id"])
        _assert_no_machine_conflict(db, data["machine_id"], data["scheduled_start"], data["scheduled_end"])

    batch_number = number_series_service.next_number(db, "PRODUCTION_BATCH")
    batch = ProductionSchedule(batch_number=batch_number, created_by=user_id, **data)
    db.add(batch)
    db.flush()
    _reserve_batch_materials(db, batch)
    audit_service.log_create(db, TABLE_NAME, batch.id, user_id)
    if order is not None:
        deal_service.advance_stage(db, order.deal_id, "production", user_id=user_id)
    db.commit()
    db.refresh(batch)
    return get_batch(db, batch.id)


def update_batch(db: Session, batch_id: int, data: dict, user_id: int | None = None) -> ProductionSchedule:
    batch = get_batch(db, batch_id)
    _reject_production_order_linked(batch)
    if batch.status != "planned":
        raise ConflictError("Only planned batches can be edited; cancel and recreate instead.")

    if "order_id" in data and data["order_id"]:
        _validate_order(db, data["order_id"])
    if "product_id" in data and data["product_id"] != batch.product_id:
        _validate_product(db, data["product_id"])
    if "machine_id" in data and data["machine_id"] and data["machine_id"] != batch.machine_id:
        _validate_machine(db, data["machine_id"])

    new_machine_id = data["machine_id"] if "machine_id" in data else batch.machine_id
    new_scheduled_start = data.get("scheduled_start", batch.scheduled_start)
    new_scheduled_end = data.get("scheduled_end", batch.scheduled_end)
    if (
        new_machine_id != batch.machine_id
        or new_scheduled_start != batch.scheduled_start
        or new_scheduled_end != batch.scheduled_end
    ):
        _assert_no_machine_conflict(
            db, new_machine_id, new_scheduled_start, new_scheduled_end, exclude_batch_id=batch.id
        )

    # Whatever's currently reserved was reserved against the batch's
    # *current* product/quantity -- if either is about to change, release
    # that exact hold before touching the fields, then re-reserve against
    # the new figures once they're set, so at every moment the reservation
    # matches what the batch actually says it needs.
    material_inputs_changed = ("product_id" in data and data["product_id"] != batch.product_id) or (
        "planned_quantity" in data and float(data["planned_quantity"]) != float(batch.planned_quantity)
    )
    scheduling_inputs_changed = material_inputs_changed or (
        "order_id" in data and data["order_id"] != batch.order_id
    )
    new_order_id = data["order_id"] if "order_id" in data else batch.order_id
    if scheduling_inputs_changed and new_order_id:
        new_product_id = data.get("product_id", batch.product_id)
        new_planned_quantity = float(data.get("planned_quantity", batch.planned_quantity))
        _assert_no_duplicate_scheduling(
            db, new_order_id, new_product_id, new_planned_quantity, exclude_batch_id=batch.id
        )

    if material_inputs_changed:
        _release_batch_materials(db, batch)

    changes: dict[str, tuple] = {}
    for field, new_value in data.items():
        old_value = getattr(batch, field)
        if old_value != new_value:
            changes[field] = (old_value, new_value)
            setattr(batch, field, new_value)
    batch.updated_by = user_id

    if material_inputs_changed:
        _reserve_batch_materials(db, batch)

    audit_service.log_update(db, TABLE_NAME, batch_id, changes, user_id)
    db.commit()
    db.refresh(batch)
    return get_batch(db, batch_id)


def delete_batch(db: Session, batch_id: int, user_id: int | None = None) -> None:
    batch = get_batch(db, batch_id)
    _reject_production_order_linked(batch)
    if batch.status != "planned":
        raise ConflictError("Only planned batches can be deleted; cancel started batches instead.")
    _release_batch_materials(db, batch)
    batch.deleted_at = now_kuwait_naive()
    audit_service.log_delete(db, TABLE_NAME, batch_id, user_id)
    db.commit()


def restore_batch(db: Session, batch_id: int, user_id: int | None = None) -> ProductionSchedule:
    batch = get_batch(db, batch_id, include_deleted=True)
    _reject_production_order_linked(batch)
    batch.deleted_at = None
    audit_service.log_restore(db, TABLE_NAME, batch_id, user_id)
    db.commit()
    _reserve_batch_materials(db, batch)
    return get_batch(db, batch_id)


def _start_batch(db: Session, batch: ProductionSchedule, user_id: int | None) -> None:
    batch.actual_start = now_kuwait_naive()
    # If this batch is fulfilling a confirmed order, starting production is
    # exactly what should move the order from 'confirmed' to
    # 'in_production' -- previously that transition existed on Order but
    # had nothing driving it (see order_service.change_status's comment
    # about stock side-effects "kept simple until the MRP/feasibility
    # engine exists"). Imported locally to avoid a circular import, same
    # pattern order_service uses for quotation_service.
    if batch.order_id and batch.order.status == "confirmed":
        from app.services import order_service

        order_service.change_status(db, batch.order_id, "in_production", user_id=user_id)


def _record_output(
    db: Session,
    batch: ProductionSchedule,
    quantity: float,
    actual_materials: list[dict] | None,
    user_id: int | None,
) -> None:
    """Records one round of actual output against `batch` -- `quantity`
    is just *this round's* amount, never the batch's running total (see
    ProductionSchedule.produced_quantity's own comment). Called once for
    a batch completed in a single step (the common case), or more than
    once for a batch that's had one or more log_partial_production calls
    before its final completion -- each call posts its own stock
    movements and releases its own slice of the reservation, exactly like
    a fresh completion would, just scoped to `quantity` instead of the
    batch's full planned_quantity.

    actual_materials: [{"raw_material_id":, "quantity_used":,
    "substituted_for_raw_material_id": optional}]. raw_material_id is
    whatever was *actually* consumed -- ordinarily the BOM's own
    material, but when substituted_for_raw_material_id is set, it names
    an approved alternative (see raw_material_alternative_service) used
    in place of that BOM material instead. The BOM itself is never
    touched by this -- only this batch's actual consumption record and
    the resulting stock movement (see the substitution note below) show
    what was really used. Always describes this round only, same as
    `quantity`.

    Leaves batch.status, actual_end, and any further reservation release
    (beyond this round's own slice) to the caller -- see change_status's
    "completed"/"paused" handling and log_partial_production.
    """
    detailed = bom_service.explode_requirements_detailed(db, batch.product_id, quantity)
    actual_materials = actual_materials or []

    # Each entry fulfills exactly one BOM-required material (itself,
    # unless substituted_for_raw_material_id says otherwise) -- collect
    # what's actually consumed per material, and which BOM requirements
    # were explicitly addressed so they don't *also* fall through to
    # their BOM default below.
    consumption: dict[int, float] = {}
    entries_by_bom_id: dict[int, dict] = {}
    for entry in actual_materials:
        actual_id = entry["raw_material_id"]
        bom_id = entry.get("substituted_for_raw_material_id") or actual_id
        consumption[actual_id] = consumption.get(actual_id, 0.0) + float(entry["quantity_used"])
        entries_by_bom_id[bom_id] = entry

    # What gets deducted for any BOM-required material nobody explicitly
    # reported on: its own scrap-inflated planned figure -- same "no
    # actual data, trust the formula" default as before this feature
    # existed, so a completion with no actual_materials given behaves
    # identically to the old behavior.
    for raw_material_id, req in detailed.items():
        if raw_material_id not in entries_by_bom_id:
            consumption[raw_material_id] = consumption.get(raw_material_id, 0.0) + req["scrap_inflated_required"]

    # Check every required material is available before touching any stock.
    # adjust_stock() commits per call, so issuing materials one at a time
    # in a loop and discovering a shortfall partway through would leave
    # some materials already deducted -- this pre-check is what keeps
    # completion effectively all-or-nothing instead.
    if consumption:
        materials = {
            m.id: m
            for m in db.query(RawMaterial)
            .filter(RawMaterial.id.in_(consumption.keys()))
            .all()
        }
        shortfalls = []
        for raw_material_id, required_qty in consumption.items():
            stock = inventory_service.get_stock(db, "raw_material", raw_material_id)
            available = stock["quantity_on_hand"]
            if available < required_qty:
                material = materials.get(raw_material_id)
                label = material.name if material else f"#{raw_material_id}"
                shortfalls.append(f"{label} (need {required_qty:.4f}, have {available:.4f})")
        if shortfalls:
            raise AppError(
                "Not enough raw material on hand to record this: " + "; ".join(shortfalls)
            )

    # Compare actual consumption against what the BOM says this material's
    # own contributing line(s) allow, in both directions:
    #  - over the scrap_percent allowance -> used more than the admin-
    #    configured tolerance for waste explains -- a scrap-allowance breach.
    #  - under the zero-scrap requirement -> used less than the bare
    #    minimum physically needed for the reported produced_quantity --
    #    a material discrepancy (the numbers don't add up: either the
    #    output is overstated, the usage is understated, or material
    #    went somewhere the record doesn't show).
    # Only BOM requirements someone actually entered an actual figure
    # for are checked -- one left at the BOM default trivially matches
    # it. When the actual material differs from the BOM's own (an
    # approved alternative was used instead), the BOM's net/planned
    # figures are scaled by that alternative's conversion_ratio first,
    # so "how much of B should replace A" is compared like-for-like
    # rather than against A's own raw numbers.
    findings: list[dict] = []
    materials_for_findings: dict[int, RawMaterial] = {}
    if entries_by_bom_id:
        lookup_ids = set(entries_by_bom_id.keys()) | {e["raw_material_id"] for e in entries_by_bom_id.values()}
        materials_for_findings = {
            m.id: m for m in db.query(RawMaterial).filter(RawMaterial.id.in_(lookup_ids)).all()
        }
    for bom_material_id, entry in entries_by_bom_id.items():
        req = detailed.get(bom_material_id)
        if req is None:
            continue
        actual_material_id = entry["raw_material_id"]
        actual_qty = float(entry["quantity_used"])

        conversion_ratio = 1.0
        if actual_material_id != bom_material_id:
            approved_alt = next(
                (
                    a
                    for a in raw_material_alternative_service.get_alternatives(db, bom_material_id)
                    if a.alternative_material_id == actual_material_id and a.status == "approved"
                ),
                None,
            )
            conversion_ratio = float(approved_alt.conversion_ratio) if approved_alt else 1.0

        net_required = req["net_required"] * conversion_ratio
        planned_required = req["scrap_inflated_required"] * conversion_ratio
        material = materials_for_findings.get(actual_material_id)
        label = material.name if material else f"#{actual_material_id}"
        unit = material.unit if material else ""
        if net_required > 0 and actual_qty < net_required:
            findings.append(
                {
                    "raw_material_id": actual_material_id,
                    "material": label,
                    "unit": unit,
                    "type": "discrepancy",
                    "actual_used": actual_qty,
                    "minimum_required": round(net_required, 4),
                    "message": (
                        f"{label}: used {actual_qty:.4f} {unit}, but producing this output needs at "
                        f"least {net_required:.4f} {unit} -- the numbers don't add up."
                    ),
                }
            )
        elif planned_required > 0 and actual_qty > planned_required:
            actual_scrap_percent = round((actual_qty - net_required) / net_required * 100, 2) if net_required > 0 else None
            allowed_scrap_percent = (
                round((planned_required - net_required) / net_required * 100, 2) if net_required > 0 else 0.0
            )
            findings.append(
                {
                    "raw_material_id": actual_material_id,
                    "material": label,
                    "unit": unit,
                    "type": "scrap_allowance_breach",
                    "actual_used": actual_qty,
                    "allowed_up_to": round(planned_required, 4),
                    "actual_scrap_percent": actual_scrap_percent,
                    "allowed_scrap_percent": allowed_scrap_percent,
                    "message": (
                        f"{label}: used {actual_qty:.4f} {unit} ({actual_scrap_percent}% scrap), "
                        f"over the {allowed_scrap_percent}% allowance configured for this product "
                        f"(allowed up to {planned_required:.4f} {unit})."
                    ),
                }
            )

    for raw_material_id, quantity_used in consumption.items():
        # Substitution is recorded on the movement itself -- the
        # permanent, queryable record of "this batch actually consumed
        # this material" -- rather than a new column, since
        # stock_movements already is that ledger (filterable by
        # reference_type/reference_id=this batch).
        note = f"Consumed by batch {batch.batch_number}"
        substituted_bom_id = next(
            (bid for bid, e in entries_by_bom_id.items() if e["raw_material_id"] == raw_material_id and bid != raw_material_id),
            None,
        )
        if substituted_bom_id is not None:
            bom_material = materials_for_findings.get(substituted_bom_id) or db.query(RawMaterial).filter(
                RawMaterial.id == substituted_bom_id
            ).first()
            note += f" (approved alternative for {bom_material.code if bom_material else f'#{substituted_bom_id}'})"
        inventory_service.adjust_stock(
            db,
            item_type="raw_material",
            item_id=raw_material_id,
            quantity=-quantity_used,
            movement_type="issue",
            reference_type="production_schedule",
            reference_id=batch.id,
            notes=note,
            user_id=user_id,
            commit=False,
        )

    inventory_service.adjust_stock(
        db,
        item_type="product",
        item_id=batch.product_id,
        quantity=quantity,
        movement_type="receipt",
        reference_type="production_schedule",
        reference_id=batch.id,
        notes=f"Produced by batch {batch.batch_number}",
        user_id=user_id,
        commit=False,
    )

    # The slice of the hold placed when this batch was scheduled
    # (_reserve_batch_materials, called from create_batch/update_batch)
    # that corresponds to *this round's* quantity is no longer needed now
    # that the materials have actually been consumed above -- release
    # just that slice, based on quantity (what was actually used this
    # round), not the batch's full planned_quantity, since more rounds
    # (or an early close-out that forfeits the rest -- see change_status)
    # may still follow this one.
    _release_reservation_for_quantity(db, batch, quantity, commit=False)

    # Cumulative, never overwritten -- see ProductionSchedule.
    # produced_quantity's own comment.
    batch.produced_quantity = float(batch.produced_quantity) + quantity
    if findings:
        batch.material_discrepancy_flag = True
        # Every round's findings pile up here rather than replacing the
        # last round's -- a discrepancy on day one doesn't stop mattering
        # because day two's numbers happened to add up.
        existing = json.loads(batch.material_discrepancy_notes) if batch.material_discrepancy_notes else []
        batch.material_discrepancy_notes = json.dumps(existing + findings)


def change_status(
    db: Session,
    batch_id: int,
    new_status: str,
    produced_quantity: float | None = None,
    actual_materials: list[dict] | None = None,
    reason: str | None = None,
    user_id: int | None = None,
) -> ProductionSchedule:
    # Locked for the whole call -- see order_service.change_status's
    # comment for why this, plus commit=False on every stock call inside
    # _record_output/_release_batch_materials below, is what stops a
    # double-submitted "complete"/"pause"/"cancel" from issuing/receiving
    # stock twice for one production run.
    batch = get_batch(db, batch_id, for_update=True)
    _reject_production_order_linked(batch)
    old_status = batch.status
    assert_transition_allowed(ALLOWED_TRANSITIONS, old_status, new_status, "production batch")

    if new_status == "in_progress":
        if old_status == "planned":
            # The start gate: a fresh backend readiness check, never a
            # frontend-only one -- if anything has changed since the batch
            # was planned (stock consumed elsewhere, the BOM deactivated, a
            # machine slot double-booked), this is what actually stops the
            # start, with the exact reason surfaced in the error.
            readiness = production_readiness_service.check_batch_readiness(db, batch_id)
            if readiness["status"] != "READY":
                raise ConflictError(f"Cannot start production: {readiness['summary']}")
            if batch.order_id:
                from app.services import payment_service

                block_reason = payment_service.get_production_payment_block_reason(db, batch.order)
                if block_reason:
                    raise ConflictError(f"Cannot start production: {block_reason}")
            _start_batch(db, batch, user_id)
        # else old_status == "paused": resuming right where it left off --
        # actual_start/reservation/produced_quantity are all untouched, no
        # re-check. (A paused batch never released more than its own
        # already-produced slice of the reservation, so what's left is
        # still held exactly as it was before the pause.)
    elif new_status == "paused":
        assert_reason_given(reason, "A reason is required to pause a production batch.")
        batch.pause_reason = reason
    elif new_status == "completed":
        if produced_quantity:
            _record_output(db, batch, produced_quantity, actual_materials, user_id)
        if float(batch.produced_quantity) <= 0:
            raise ValidationAppError(
                "Nothing has been produced yet -- log some output or provide produced_quantity to "
                "complete this batch."
            )
        # Whatever's left of the reservation beyond what's actually been
        # produced (across this call and any log_partial_production calls
        # before it) is forfeit -- closing out at less than planned_quantity
        # (or, less commonly, over it) is a deliberate choice, but one
        # that now has to be explained: QUANTITY_DISCREPANCY_TOLERANCE
        # allows for harmless rounding, not a genuine under/over-run.
        if abs(float(batch.produced_quantity) - float(batch.planned_quantity)) > QUANTITY_DISCREPANCY_TOLERANCE:
            assert_reason_given(
                reason,
                f"Produced quantity ({batch.produced_quantity}) differs from planned "
                f"({batch.planned_quantity}) -- a reason is required to complete this batch.",
            )
            batch.quantity_discrepancy_reason = reason
        _release_batch_materials(db, batch, commit=False)
        batch.actual_end = now_kuwait_naive()
    elif new_status == "cancelled":
        assert_reason_given(reason, "A reason is required to cancel a production batch.")
        batch.cancel_reason = reason
        _release_batch_materials(db, batch, commit=False)

    batch.status = new_status
    batch.updated_by = user_id
    audit_service.log_update(
        db, TABLE_NAME, batch_id, {"status": (old_status, new_status)}, user_id
    )
    db.commit()
    db.refresh(batch)

    if new_status == "completed":
        _maybe_advance_order_to_ready_to_ship(db, batch.order_id, user_id)

    return get_batch(db, batch_id)


def get_order_product_quantity_summary(
    db: Session, order_id: int, product_id: int, exclude_batch_id: int | None = None
) -> dict:
    """The single "where does this order's production for this product
    actually stand" figure -- ordered / scheduled / produced / remaining
    -- combining every batch tied to that order+product instead of
    making a person piece it together by hand from however many batches
    exist. Used both to display that row directly on the production
    batch detail page and, via `remaining`, to guard against scheduling
    more than an order's line actually still needs (see
    _assert_no_duplicate_scheduling) and to compute what's left to
    reschedule after a cancellation (get_resulting_unscheduled_quantity).

    - ordered: the order line's quantity for this product (0 if this
      product isn't actually on the order).
    - produced: cumulative produced_quantity across every batch tied to
      this order+product, whatever its current status -- output already
      made is real regardless of what happened to the batch afterward.
    - scheduled: planned_quantity minus produced_quantity, summed across
      only still-active (planned/in_progress/paused) batches -- capacity
      genuinely committed but not yet delivered as output.
    - remaining: max(ordered - produced - scheduled, 0) -- what's
      neither been made nor has a batch covering it yet.

    `exclude_batch_id` leaves one batch out of both produced and
    scheduled entirely -- used when checking whether *that* batch's own
    quantity would over-schedule the line (its own existing contribution
    shouldn't count against itself), and when a cancelled batch (already
    excluded from `scheduled` by its own status, but its produced_quantity
    would otherwise still count) needs to be left out of `produced` too.
    """
    query = db.query(ProductionSchedule).filter(
        ProductionSchedule.order_id == order_id,
        ProductionSchedule.product_id == product_id,
        ProductionSchedule.deleted_at.is_(None),
    )
    if exclude_batch_id is not None:
        query = query.filter(ProductionSchedule.id != exclude_batch_id)
    batches = query.all()

    ordered = float(
        db.query(func.coalesce(func.sum(OrderDetail.quantity), 0))
        .filter(OrderDetail.order_id == order_id, OrderDetail.product_id == product_id)
        .scalar()
    )
    produced = round(sum(float(b.produced_quantity) for b in batches), 4)
    scheduled = round(
        sum(
            max(float(b.planned_quantity) - float(b.produced_quantity), 0.0)
            for b in batches
            if b.status in ("planned", "in_progress", "paused")
        ),
        4,
    )
    remaining = round(max(ordered - produced - scheduled, 0.0), 4)
    return {"ordered": ordered, "scheduled": scheduled, "produced": produced, "remaining": remaining}


def get_resulting_unscheduled_quantity(db: Session, batch: ProductionSchedule) -> float | None:
    """After cancelling a batch tied to a still-active order, how much of
    that order's demand for the batch's product now has no production
    scheduled against it at all -- the exact number that would otherwise
    only surface later, indirectly, via the MRP screen's "outstanding
    order with no batch scheduled" pass (see mrp_service._quantity_to_produce).
    Returned straight off the cancellation instead, so nobody has to go
    looking for it.

    None when the batch isn't cancelled, isn't tied to an order, or that
    order is no longer active (cancelled, or already fully
    shipped/delivered) -- the question is moot then.
    """
    if batch.status != "cancelled" or batch.order_id is None:
        return None

    order = db.query(Order).filter(Order.id == batch.order_id).first()
    if order is None or order.status not in OPEN_STATUSES:
        return None

    summary = get_order_product_quantity_summary(db, order.id, batch.product_id, exclude_batch_id=batch.id)
    if summary["ordered"] <= 0:
        return None
    return summary["remaining"]


def get_days_overdue(batch: ProductionSchedule, today: date | None = None) -> int | None:
    """How many days past scheduled_end this batch is -- the same
    condition escalate_overdue_batches flags for admin review, but as a
    number instead of a boolean, and computed live off the batch's
    current fields rather than only whenever the periodic scan last ran.
    None once it's closed out (completed/cancelled) or not yet overdue.
    """
    if batch.status in ("completed", "cancelled"):
        return None
    as_of = today or today_kuwait()
    days = (as_of - batch.scheduled_end).days
    return days if days > 0 else None


def _find_machine_conflicts(
    db: Session, machine_id: int, start: date, end: date, exclude_batch_id: int | None = None
) -> list[ProductionSchedule]:
    """Other booked batches (planned/in_progress/paused) on `machine_id`
    whose own [scheduled_start, scheduled_end] overlaps [start, end] --
    the shared window-overlap query behind both get_machine_conflicts
    (an existing batch checking itself) and _assert_no_machine_conflict
    (a not-yet-created/not-yet-changed batch checking a candidate
    window before committing to it)."""
    query = db.query(ProductionSchedule).filter(
        ProductionSchedule.machine_id == machine_id,
        ProductionSchedule.deleted_at.is_(None),
        ProductionSchedule.status.in_(("planned", "in_progress", "paused")),
        ProductionSchedule.scheduled_end >= start,
        ProductionSchedule.scheduled_start <= end,
    )
    if exclude_batch_id is not None:
        query = query.filter(ProductionSchedule.id != exclude_batch_id)
    return query.all()


def get_machine_conflicts(db: Session, batch: ProductionSchedule) -> list[dict]:
    """Other booked batches sharing this batch's machine with an
    overlapping scheduled window -- the literal, batch-level "what else
    is fighting for this same machine slot" question, distinct from
    production_readiness_service's hours-based capacity check (which
    answers "is there enough free time in this window", not "which
    specific other batch is double-booking it"). Empty when this batch
    has no machine assigned, or isn't itself still occupying a slot
    (completed/cancelled).
    """
    if batch.machine_id is None or batch.status not in ("planned", "in_progress", "paused"):
        return []

    others = _find_machine_conflicts(db, batch.machine_id, batch.scheduled_start, batch.scheduled_end, batch.id)
    return [
        {
            "id": other.id,
            "batch_number": other.batch_number,
            "scheduled_start": other.scheduled_start,
            "scheduled_end": other.scheduled_end,
        }
        for other in others
    ]


def _assert_no_machine_conflict(
    db: Session, machine_id: int | None, scheduled_start: date, scheduled_end: date, exclude_batch_id: int | None = None
) -> None:
    """Blocks creating/editing a batch into a window that overlaps
    another already-booked batch on the same machine -- the legacy
    flow's own version of production_order_schedule_service._check_
    conflict, which already prevents this for Production-Order-driven
    schedules. Same table, same BOOKED_PRODUCTION_STATUSES-equivalent
    filter (see _find_machine_conflicts), so a legacy batch and a
    Production Order schedule on the same machine conflict with each
    other exactly as two of either kind would."""
    if machine_id is None:
        return
    conflicts = _find_machine_conflicts(db, machine_id, scheduled_start, scheduled_end, exclude_batch_id)
    if conflicts:
        other = conflicts[0]
        raise ConflictError(
            f"This machine is already booked by {other.batch_number} from "
            f"{other.scheduled_start} to {other.scheduled_end}."
        )


def log_partial_production(
    db: Session,
    batch_id: int,
    quantity: float,
    actual_materials: list[dict] | None = None,
    user_id: int | None = None,
) -> ProductionSchedule:
    """Records output produced so far without closing the batch out --
    for a run that's stopping partway through (about to be paused for a
    breakdown, a shift change, a quality question) but has genuinely made
    some of its planned quantity already. Callable more than once; the
    batch stays exactly where it is (in_progress or paused) and can still
    be paused, resumed, cancelled, or finally completed afterward --
    change_status's "completed" handling adds in whatever's recorded here
    plus any final increment given directly to it.

    Locked the same way change_status is, for the same double-submit
    reason -- see its own comment.
    """
    batch = get_batch(db, batch_id, for_update=True)
    if batch.status not in ("in_progress", "paused"):
        raise ConflictError(
            f"Cannot log production against a batch in '{batch.status}' status; "
            "it must be in progress or paused."
        )
    if not quantity or quantity <= 0:
        raise ValidationAppError("quantity must be greater than zero.")

    before = float(batch.produced_quantity)
    _record_output(db, batch, quantity, actual_materials, user_id)
    batch.updated_by = user_id
    audit_service.log_update(
        db, TABLE_NAME, batch_id, {"produced_quantity": (before, float(batch.produced_quantity))}, user_id
    )
    db.commit()
    db.refresh(batch)
    return get_batch(db, batch_id)


def log_production(
    db: Session,
    product_id: int,
    quantity: float,
    notes: str | None = None,
    entry_date: date | None = None,
    user_id: int | None = None,
) -> ProductionSchedule:
    """One-step logging for production that's already happened -- e.g.
    entering today's output at day's end, rather than planning a batch
    ahead of time and clicking through in_progress/completed by hand.
    Walks the exact same planned -> in_progress -> completed pipeline as
    a normal batch (create_batch, then change_status twice) so it's
    validated and audited identically -- the same BOM-driven material
    consumption, the same stock-shortfall pre-check, the same order
    auto-progression hooks if it happened to be tied to one -- there's no
    separate, duplicated "quick" code path.

    `entry_date` defaults to today (e.g. the Production list's "Log
    production" button); the calendar's day-actions popup passes the
    clicked day instead, so a person can catch up on an entry they
    forgot to make -- but only up to MAX_BACKDATE_DAYS back, and never
    into the future (see assert_within_backdate_window).

    Not tied to any order (make-to-stock, the normal case for a
    same-day log) and always runs on the product's own default machine
    (create_batch already falls back to product.machine_id when none is
    given). If completion fails -- most commonly, not enough raw
    material on hand -- the batch this created is cancelled rather than
    left stuck in_progress, so a failed quick-log doesn't leave a
    dangling half-done batch behind; the caller just sees the original
    error and nothing else changed.
    """
    today = today_kuwait()
    target_date = entry_date or today
    assert_within_backdate_window(target_date, today, "production")

    batch = create_batch(
        db,
        {
            "product_id": product_id,
            "machine_id": None,
            "order_id": None,
            "planned_quantity": quantity,
            "scheduled_start": target_date,
            "scheduled_end": target_date,
            "notes": notes,
        },
        user_id=user_id,
    )
    try:
        change_status(db, batch.id, "in_progress", user_id=user_id)
        return change_status(db, batch.id, "completed", produced_quantity=quantity, user_id=user_id)
    except AppError:
        try:
            change_status(
                db, batch.id, "cancelled", reason="Quick-log failed -- see prior error.", user_id=user_id
            )
        except AppError:
            pass
        raise


def _maybe_advance_order_to_ready_to_ship(db: Session, order_id: int | None, user_id: int | None) -> None:
    """The symmetric close of _start_batch's order -> 'in_production' hook
    above: once every (non-cancelled) production batch tied to an order
    has completed, the order genuinely is ready to ship -- advance it
    automatically rather than leaving a person to notice and do it by
    hand. Unlike the auto-create hooks elsewhere in this pipeline, this
    one has no settings toggle: it's not creating a new record on a
    judgement call, just recognizing a status that's already objectively
    true (same as _start_batch's hook, which has always been
    unconditional). Never raises -- best-effort, same as every other
    auto-progression hook.
    """
    if order_id is None:
        return
    order = db.query(Order).filter(Order.id == order_id, Order.deleted_at.is_(None)).first()
    if order is None or order.status != "in_production":
        return

    batches = (
        db.query(ProductionSchedule)
        .filter(ProductionSchedule.order_id == order_id, ProductionSchedule.deleted_at.is_(None))
        .all()
    )
    if any(b.status not in ("completed", "cancelled") for b in batches):
        return  # still waiting on at least one batch
    if not any(b.status == "completed" for b in batches):
        return  # every batch was cancelled -- nothing was actually produced

    from app.services import order_service

    try:
        order_service.change_status(db, order_id, "ready_to_ship", user_id=user_id)
    except (ConflictError, ValidationAppError):
        pass


def escalate_overdue_batches(db: Session, as_of: date | None = None) -> list[ProductionSchedule]:
    """The production-side mirror of order_service.escalate_overdue_orders
    / purchase_order_service.escalate_overdue_purchase_orders: flags every
    batch past its scheduled_end that isn't completed or cancelled -- a
    run behind schedule -- for admin attention. 'planned' counts too, not
    just 'in_progress'/'paused': a batch that never even started by its
    scheduled end date is, if anything, more concerning than one that's
    merely running late partway through. Meant to be run periodically
    (see core/scheduler.py); idempotent -- re-running only (re)flags
    batches that still qualify, it never clears admin_review_required
    itself (only admin_review does that).
    """
    today = as_of or today_kuwait()

    candidates = (
        db.query(ProductionSchedule)
        .filter(
            ProductionSchedule.deleted_at.is_(None),
            ProductionSchedule.status.notin_(("completed", "cancelled")),
            ProductionSchedule.admin_review_required.is_(False),
        )
        .all()
    )

    flagged: list[ProductionSchedule] = []
    for batch in candidates:
        if batch.scheduled_end < today:
            batch.admin_review_required = True
            audit_service.log_update(
                db, TABLE_NAME, batch.id, {"admin_review_required": (False, True)}, None
            )
            flagged.append(batch)

    if flagged:
        db.commit()
    return flagged


def admin_review(db: Session, batch_id: int, notes: str, user_id: int | None = None) -> ProductionSchedule:
    """Admin clears an overdue-schedule escalation, recording their decision."""
    batch = get_batch(db, batch_id)
    if not batch.admin_review_required:
        raise ConflictError("This production batch has no pending admin review.")

    batch.admin_review_required = False
    batch.admin_reviewed_at = now_kuwait_naive()
    batch.admin_reviewed_by = user_id
    batch.admin_review_notes = notes
    batch.updated_by = user_id
    audit_service.log_update(
        db, TABLE_NAME, batch_id, {"admin_review_required": (True, False)}, user_id
    )
    db.commit()
    return get_batch(db, batch_id)
