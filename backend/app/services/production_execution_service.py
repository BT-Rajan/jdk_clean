"""P6: what actually happened when a scheduled Production Order was run
-- the WHAT-HAPPENED layer sitting on top of ProductionOrder (P2, WHAT),
Material Allocation (P4, what's been committed), and ProductionSchedule
(P5, WHEN/WHERE for this flow). See docs/production-lifecycle.md and
app/models/production_execution.py for the full architecture note.

Material consumption reuses the existing inventory transaction
architecture end to end: inventory_service.adjust_stock for the
physical, traceable stock movement, and
production_order_material_service.consume for turning an allocation
into an actual issue -- no second stock ledger, no second reservation
mechanism. See consume()'s own docstring for why completion (not
starting, not scheduling) is the transaction point.

All server-authoritative timestamps here come from
core.timezone.now_kuwait_naive() -- see that function's own docstring.
"""

from sqlalchemy.orm import Session, joinedload

from app.core.exceptions import ConflictError, NotFoundError, ValidationAppError
from app.core.timezone import now_kuwait_naive
from app.core.workflow import assert_reason_given, assert_transition_allowed
from app.models.machine import Machine
from app.models.production_execution import ALLOWED_TRANSITIONS, ProductionExecution
from app.models.production_order import ProductionOrder
from app.models.production_schedule import ProductionSchedule
from app.services import audit_service, bom_service, packaging_service, production_order_material_service

TABLE_NAME = "production_executions"


def _base_query(db: Session):
    return db.query(ProductionExecution).options(
        joinedload(ProductionExecution.product),
        joinedload(ProductionExecution.machine),
        joinedload(ProductionExecution.schedule),
    )


def get_execution(db: Session, execution_id: int) -> ProductionExecution:
    obj = _base_query(db).filter(ProductionExecution.id == execution_id).first()
    if obj is None:
        raise NotFoundError("Production execution")
    return obj


def list_executions_for_production_order(db: Session, production_order_id: int) -> list[ProductionExecution]:
    return (
        _base_query(db)
        .filter(ProductionExecution.production_order_id == production_order_id)
        .order_by(ProductionExecution.started_at)
        .all()
    )


def _completed_quantity(db: Session, production_order_id: int, for_update: bool = False, exclude_execution_id: int | None = None) -> float:
    """Sum of produced_quantity across every 'completed' execution for
    this Production Order -- the one place total-produced is computed,
    so the overproduction guard and the progress summary can never
    disagree. Cancelled/in-progress runs never count: a run that was
    abandoned or hasn't finished yet isn't real output.

    `for_update=True` issues a locking read -- same REPEATABLE READ
    staleness reasoning as production_order_service._committed_quantity
    and production_order_schedule_service._scheduled_quantity.
    """
    query = db.query(ProductionExecution.produced_quantity).filter(
        ProductionExecution.production_order_id == production_order_id,
        ProductionExecution.status == "completed",
    )
    if exclude_execution_id:
        query = query.filter(ProductionExecution.id != exclude_execution_id)
    if for_update:
        query = query.with_for_update()
    return sum(float(row[0]) for row in query.all())


def get_produced_quantity(db: Session, production_order_id: int) -> float:
    """Public, read-only entry point for _completed_quantity -- for
    callers (the Production Order resource itself) that just want the
    current total, not the write-path's locking/exclusion options."""
    return round(_completed_quantity(db, production_order_id), 4)


def get_progress(db: Session, production_order_id: int) -> dict:
    """Planned/produced/remaining for a Production Order, plus every
    execution run -- always derived from this table's own rows, never a
    duplicated running total stored on the Production Order itself (spec
    P6 section 12)."""
    po = db.query(ProductionOrder).filter(ProductionOrder.id == production_order_id).first()
    if po is None:
        raise NotFoundError("Production order")

    runs = list_executions_for_production_order(db, production_order_id)
    total_produced = round(sum(float(r.produced_quantity) for r in runs if r.status == "completed"), 4)
    remaining_to_produce = max(round(float(po.planned_quantity) - total_produced, 4), 0)

    if any(r.status == "in_progress" for r in runs):
        execution_status = "in_progress"
    elif total_produced >= float(po.planned_quantity) and runs:
        execution_status = "completed"
    elif runs:
        execution_status = "partially_completed" if total_produced > 0 else "not_started"
    else:
        execution_status = "not_started"

    return {
        "production_order_id": production_order_id,
        "planned_quantity": float(po.planned_quantity),
        "total_produced": total_produced,
        "remaining_to_produce": remaining_to_produce,
        "execution_status": execution_status,
        "runs": runs,
    }


def _lock_production_order(db: Session, production_order_id: int):
    """Column-only locking read -- see production_order_material_service.
    calculate's own comment: ProductionOrder's relationships are
    lazy="joined" at the model level, so a plain entity query under
    with_for_update() would implicitly outer-join them."""
    locked = (
        db.query(
            ProductionOrder.status,
            ProductionOrder.product_id,
            ProductionOrder.planned_quantity,
            ProductionOrder.order_id,
        )
        .filter(ProductionOrder.id == production_order_id)
        .with_for_update()
        .first()
    )
    if locked is None:
        raise NotFoundError("Production order")
    return locked


def _lock_schedule_row(db: Session, schedule_id: int):
    """Column-only locking read of the schedule this run will use --
    also what serializes two concurrent 'start' requests against the
    same schedule (Test 8/spec section 19): whichever request's
    transaction gets this lock first sees no existing 'in_progress'
    execution and proceeds; the second, once it gets the lock, sees the
    first's now-committed execution and is rejected."""
    row = (
        db.query(
            ProductionSchedule.id,
            ProductionSchedule.status,
            ProductionSchedule.production_order_id,
            ProductionSchedule.product_id,
            ProductionSchedule.machine_id,
        )
        .filter(ProductionSchedule.id == schedule_id, ProductionSchedule.deleted_at.is_(None))
        .with_for_update()
        .first()
    )
    if row is None:
        raise NotFoundError("Production schedule")
    return row


def _lock_execution_row(db: Session, execution_id: int):
    """Column-only locking read -- ProductionExecution's own
    relationships (product/machine/schedule/production_order) are all
    lazy="joined" too."""
    row = (
        db.query(
            ProductionExecution.id,
            ProductionExecution.production_order_id,
            ProductionExecution.schedule_id,
            ProductionExecution.product_id,
            ProductionExecution.status,
            ProductionExecution.started_at,
        )
        .filter(ProductionExecution.id == execution_id)
        .with_for_update()
        .first()
    )
    if row is None:
        raise NotFoundError("Production execution")
    return row


def start_execution(
    db: Session,
    production_order_id: int,
    schedule_id: int,
    planned_quantity: float | None = None,
    user_id: int | None = None,
) -> ProductionExecution:
    """Starts one manufacturing run against `schedule_id` (which must
    belong to `production_order_id`). Never touches inventory -- see
    this module's own docstring; starting is purely a "the clock is
    running" fact, exactly spec P6 section 16's "starting production
    does not accidentally reduce stock" requirement.

    `planned_quantity` defaults to however much of the Production
    Order's total is still unaccounted for by a completed run -- the
    same "default to what's left" convention P5's create_schedule
    already uses for its own planned_quantity. Rejected outright once
    nothing remains (spec P6 section 6/Test 4) rather than letting a
    pointless zero-or-negative-value run start.
    """
    po = _lock_production_order(db, production_order_id)
    if po.status != "planned":
        raise ConflictError(f"Cannot start production for a production order in '{po.status}' status.")

    if po.order_id:
        from app.models.order import Order
        from app.services import payment_service

        order = db.query(Order).filter(Order.id == po.order_id, Order.deleted_at.is_(None)).first()
        if order is not None:
            block_reason = payment_service.get_production_payment_block_reason(db, order)
            if block_reason:
                raise ConflictError(f"Cannot start production: {block_reason}")

    schedule = _lock_schedule_row(db, schedule_id)
    if schedule.production_order_id != production_order_id:
        raise ValidationAppError("This schedule does not belong to the given production order.")
    if schedule.status != "planned":
        raise ConflictError(f"Cannot start production against a schedule in '{schedule.status}' status.")

    machine = None
    if schedule.machine_id:
        machine = db.query(Machine).filter(Machine.id == schedule.machine_id, Machine.deleted_at.is_(None)).first()
        if machine is None:
            raise ValidationAppError("This schedule's machine no longer exists.")
        if machine.status != "active":
            raise ValidationAppError(f"{machine.name} is inactive and cannot run production.")

    # Guards Test 8 (duplicate start): with the schedule row already
    # locked above, this query is guaranteed to see any 'in_progress'
    # execution a concurrent request just committed while this one
    # waited for the lock.
    existing = (
        db.query(ProductionExecution.id)
        .filter(ProductionExecution.schedule_id == schedule_id, ProductionExecution.status == "in_progress")
        .first()
    )
    if existing is not None:
        raise ConflictError("This schedule already has a production run in progress.")

    already_produced = _completed_quantity(db, production_order_id, for_update=True)
    remaining_to_produce = round(float(po.planned_quantity) - already_produced, 4)

    run_quantity = float(planned_quantity) if planned_quantity is not None else remaining_to_produce
    if run_quantity <= 0:
        raise ValidationAppError("Planned quantity for this run must be positive.")
    if run_quantity > remaining_to_produce:
        raise ValidationAppError(
            f"Planned quantity ({run_quantity}) exceeds this production order's remaining "
            f"unproduced quantity ({remaining_to_produce})."
        )

    execution = ProductionExecution(
        production_order_id=production_order_id,
        schedule_id=schedule_id,
        product_id=schedule.product_id,
        machine_id=schedule.machine_id,
        planned_quantity=run_quantity,
        status="in_progress",
        started_at=now_kuwait_naive(),
        started_by=user_id,
        created_by=user_id,
    )
    db.add(execution)
    db.flush()
    audit_service.log_create(db, TABLE_NAME, execution.id, user_id)
    db.commit()
    return get_execution(db, execution.id)


def complete_execution(
    db: Session,
    execution_id: int,
    produced_quantity: float,
    user_id: int | None = None,
    actual_materials: list[dict] | None = None,
) -> ProductionExecution:
    """Closes out a run: records the actual quantity produced, consumes
    the BOM-scaled raw materials AND packaging materials for that
    quantity from whatever's allocated to this Production Order, and
    locks the run against further changes.

    Overproduction guard (spec P6 section 6) is enforced here against
    the Production Order's total, not this run's own planned_quantity --
    a run may legitimately produce more or less than it originally
    planned to (spec section 4), the only hard ceiling is the Production
    Order's own planned_quantity.

    Material consumption is all-or-nothing: if any required raw material
    doesn't have enough allocated-and-unconsumed left, this whole call
    raises before completing (production_order_material_service.consume
    raises per-material; nothing here has committed yet, so the request-
    level rollback in core.database.get_db discards every partial
    adjust_stock/release_reservation call already made this loop).

    `actual_materials` (P10 sections 6/7, optional): a list of
    {"raw_material_id":, "quantity_used":} overriding the BOM-scaled
    figure for specific materials, to represent what the factory
    actually consumed when it legitimately differs from the plan (e.g.
    required 1,000 kg, actually used 1,050 kg). Only these materials are
    allowed to consume beyond what's allocated-and-unconsumed (auto-
    expanding allocation the same way a manual allocate() call would,
    still gated on real stock availability) -- every other material
    keeps the strict Allocated Material Protection cap. Omitting it
    entirely (the default) keeps completion's existing, unmodified
    behaviour: purely BOM-driven, no variance reporting.
    """
    if produced_quantity is None or produced_quantity <= 0:
        raise ValidationAppError("Produced quantity must be positive to complete a production run.")

    row = _lock_execution_row(db, execution_id)
    if row.status != "in_progress":
        raise ConflictError(f"Only an in-progress run can be completed; this one is '{row.status}'.")

    po = _lock_production_order(db, row.production_order_id)
    already_produced = _completed_quantity(db, row.production_order_id, for_update=True, exclude_execution_id=execution_id)
    remaining_to_produce = round(float(po.planned_quantity) - already_produced, 4)
    if produced_quantity > remaining_to_produce:
        raise ValidationAppError(
            f"Recording {produced_quantity} would exceed this production order's planned quantity -- "
            f"only {remaining_to_produce} remains to produce."
        )

    actual_by_material: dict[int, float] = {}
    for actual in actual_materials or []:
        raw_material_id = actual["raw_material_id"]
        quantity_used = actual["quantity_used"]
        if quantity_used <= 0:
            raise ValidationAppError("Actual quantity used must be positive.")
        actual_by_material[raw_material_id] = quantity_used

    detailed = bom_service.explode_requirements_detailed(db, row.product_id, produced_quantity)
    for raw_material_id, req in detailed.items():
        if raw_material_id in actual_by_material:
            quantity_needed = round(actual_by_material.pop(raw_material_id), 4)
            allow_variance = True
        else:
            quantity_needed = round(req["scrap_inflated_required"], 4)
            allow_variance = False
        if quantity_needed > 0:
            production_order_material_service.consume(
                db, row.production_order_id, raw_material_id, quantity_needed, execution_id,
                user_id=user_id, commit=False, allow_variance=allow_variance,
            )

    if actual_by_material:
        unknown = ", ".join(str(rid) for rid in actual_by_material)
        raise ValidationAppError(f"Raw material(s) {unknown} are not part of this product's BOM.")

    # Packaging materials required for this quantity -- per finished-
    # product unit, not scrap-inflated like a BOM line (see
    # product_packaging.py's own docstring). Consumed the same way as any
    # BOM material, through the same allocation-protected consume(): a
    # packaging requirement row (source='packaging') is created by
    # calculate() and allocatable exactly like a BOM row, so completion
    # must actually draw it down too, not just calculate it (P3) and let
    # it sit allocated-but-never-consumed forever.
    for line in packaging_service.get_packaging(db, row.product_id):
        quantity_needed = round(float(line.quantity_per_unit) * produced_quantity, 4)
        if quantity_needed > 0:
            production_order_material_service.consume(
                db, row.production_order_id, line.packaging_material_id, quantity_needed, execution_id,
                user_id=user_id, commit=False, source="packaging",
            )

    ended_at = now_kuwait_naive()
    db.query(ProductionExecution).filter(ProductionExecution.id == row.id).update(
        {
            "produced_quantity": produced_quantity,
            "status": "completed",
            "ended_at": ended_at,
            "completed_by": user_id,
            "updated_by": user_id,
        }
    )
    audit_service.log_update(
        db,
        TABLE_NAME,
        row.id,
        {"status": (row.status, "completed"), "produced_quantity": (0, produced_quantity)},
        user_id,
    )
    db.commit()
    return get_execution(db, row.id)


def cancel_execution(db: Session, execution_id: int, reason: str | None, user_id: int | None = None) -> ProductionExecution:
    """Cancels an in-progress run -- preserves the row (never deletes
    it -- spec P6 section 15) with no inventory side effects, since
    starting never touched stock and completion (the only place
    consumption happens) never ran. A 'completed' run can never be
    cancelled -- ALLOWED_TRANSITIONS enforces that the same way every
    other status model in this app does.
    """
    row = _lock_execution_row(db, execution_id)
    assert_transition_allowed(ALLOWED_TRANSITIONS, row.status, "cancelled", "production execution")
    assert_reason_given(reason, "A reason is required to cancel a production execution.")

    db.query(ProductionExecution).filter(ProductionExecution.id == row.id).update(
        {"status": "cancelled", "cancel_reason": reason, "ended_at": now_kuwait_naive(), "updated_by": user_id}
    )
    audit_service.log_update(db, TABLE_NAME, row.id, {"status": (row.status, "cancelled")}, user_id)
    db.commit()
    return get_execution(db, row.id)
