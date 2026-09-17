"""P5: WHEN/WHERE a Production Order actually runs -- machine, planned
start, planned end -- reusing the existing production_schedules table
(and Machine Master) rather than a second scheduling system. See
docs/production-lifecycle.md for the full P2-P5 boundary.

A schedule created here always carries production_order_id, which is
what distinguishes it from a legacy batch auto-scheduled straight from
order confirmation (order_service._maybe_auto_schedule_production,
predates the Production Order entity entirely). That distinction
matters for one load-bearing reason: this module never reserves or
releases raw material stock. Material commitment is already Material
Allocation's job (P4, production_order_material_service.allocate/
release) -- scheduling is purely a calendar decision on top of whatever
has (or hasn't) been allocated, and the material-readiness figures
(production_order_material_service.get_requirement_summary) stay
visible on the Production Order so the user can make an informed
scheduling decision, never a hard gate (see create_schedule's own
comment on why creating a schedule isn't blocked by allocation status --
the same "readiness gates starting, not planning" rule
production_service.py's own change_status/create_batch split already
follows: production_readiness_service only gates planned -> in_progress).

Legacy batches, by contrast, reserve materials the moment they're
created (production_service._reserve_batch_materials) and release them
on edit/cancel/completion. Mixing the two models on the same row would
double-reserve or wrongly release stock -- see production_service.py's
_reject_production_order_linked guard, which stops a Production-Order-
linked schedule from ever being mutated through the legacy batch
endpoints for exactly this reason.
"""

from datetime import datetime
from datetime import time as dt_time
from datetime import timedelta

from sqlalchemy.orm import Session, joinedload

from app.core.exceptions import ConflictError, NotFoundError, ValidationAppError
from app.core.timezone import today_kuwait
from app.core.workflow import assert_reason_given, assert_transition_allowed
from app.models.machine import Machine
from app.models.product import Product
from app.models.production_order import ProductionOrder
from app.models.production_schedule import ALLOWED_TRANSITIONS, ProductionSchedule
from app.services import audit_service, capacity_service, number_series_service, production_order_service

TABLE_NAME = "production_schedules"


def _base_query(db: Session):
    return (
        db.query(ProductionSchedule)
        .options(joinedload(ProductionSchedule.product), joinedload(ProductionSchedule.machine))
        .filter(ProductionSchedule.deleted_at.is_(None))
    )


def get_schedule(db: Session, schedule_id: int) -> ProductionSchedule:
    obj = _base_query(db).filter(ProductionSchedule.id == schedule_id).first()
    if obj is None or obj.production_order_id is None:
        raise NotFoundError("Production schedule")
    return obj


def list_schedules_for_production_order(db: Session, production_order_id: int) -> list[ProductionSchedule]:
    return (
        _base_query(db)
        .filter(ProductionSchedule.production_order_id == production_order_id)
        .order_by(ProductionSchedule.planned_start)
        .all()
    )


def _scheduled_quantity(
    db: Session, production_order_id: int, for_update: bool = False, exclude_schedule_id: int | None = None
) -> float:
    """Sum of planned_quantity across every non-cancelled schedule for
    this Production Order -- the one place this is computed, so the
    creation/reschedule check and the summary can never disagree.

    `for_update=True` issues a locking read -- same reasoning as
    production_order_service._committed_quantity: under this app's
    REPEATABLE READ default, a plain read here could still return a
    snapshot from before this transaction's own row lock (taken via
    _lock_production_order, a *different* row) was granted.
    """
    query = db.query(ProductionSchedule.planned_quantity).filter(
        ProductionSchedule.production_order_id == production_order_id,
        ProductionSchedule.status != "cancelled",
        ProductionSchedule.deleted_at.is_(None),
    )
    if exclude_schedule_id:
        query = query.filter(ProductionSchedule.id != exclude_schedule_id)
    if for_update:
        query = query.with_for_update()
    return sum(float(row[0]) for row in query.all())


def get_schedule_summary(db: Session, production_order_id: int) -> dict:
    """Everything the Production Order detail page needs to show its
    schedule section: the due date, how much of the planned quantity is
    scheduled vs. still unscheduled, a simple three-state
    unscheduled/scheduled/cancelled readiness verdict (see spec section
    9 -- deliberately not a richer status: partial scheduling is fully
    described by remaining_to_schedule without needing its own state),
    and the schedule rows themselves.
    """
    po = production_order_service.get_production_order(db, production_order_id)
    schedules = list_schedules_for_production_order(db, production_order_id)
    active = [s for s in schedules if s.status != "cancelled"]
    scheduled_quantity = round(sum(float(s.planned_quantity) for s in active), 4)
    remaining_to_schedule = max(round(float(po.planned_quantity) - scheduled_quantity, 4), 0)

    if active:
        schedule_status = "scheduled"
    elif schedules:
        schedule_status = "cancelled"
    else:
        schedule_status = "unscheduled"

    return {
        "production_order_id": production_order_id,
        "due_date": po.due_date,
        "planned_quantity": float(po.planned_quantity),
        "scheduled_quantity": scheduled_quantity,
        "remaining_to_schedule": remaining_to_schedule,
        "schedule_status": schedule_status,
        "schedules": schedules,
    }


def _lock_production_order(db: Session, production_order_id: int):
    """Column-only locking read -- ProductionOrder's own relationships
    (product/order/order_detail) are lazy="joined" at the model level, so
    a plain entity query under with_for_update() would implicitly outer-
    join them; see production_order_material_service.calculate's own
    comment for why the columns needed here are read through the lock
    itself, not a plain read before/after it."""
    locked = (
        db.query(
            ProductionOrder.status,
            ProductionOrder.product_id,
            ProductionOrder.order_id,
            ProductionOrder.planned_quantity,
        )
        .filter(ProductionOrder.id == production_order_id)
        .with_for_update()
        .first()
    )
    if locked is None:
        raise NotFoundError("Production order")
    return locked


def _lock_schedule_row(db: Session, schedule_id: int):
    """Column-only locking read of a schedule -- same outer-join-under-
    FOR-UPDATE reasoning as _lock_production_order, since
    ProductionSchedule.product/machine/order/production_order are all
    lazy="joined" too."""
    row = (
        db.query(
            ProductionSchedule.id,
            ProductionSchedule.status,
            ProductionSchedule.machine_id,
            ProductionSchedule.product_id,
            ProductionSchedule.production_order_id,
            ProductionSchedule.planned_quantity,
            ProductionSchedule.planned_start,
            ProductionSchedule.planned_end,
        )
        .filter(ProductionSchedule.id == schedule_id, ProductionSchedule.deleted_at.is_(None))
        .with_for_update()
        .first()
    )
    if row is None or row.production_order_id is None:
        raise NotFoundError("Production schedule")
    return row


def _lock_machine(db: Session, machine_id: int) -> Machine:
    """Machine has no lazy="joined" relationships of its own, so a plain
    entity FOR UPDATE query is safe here (unlike the two above). Locking
    it for the whole check-then-write is what serializes two concurrent
    schedule creations against the same machine -- the same "lock the
    contested shared resource" pattern reserve_stock_within_available
    uses for the inventory row (see its docstring)."""
    machine = db.query(Machine).filter(Machine.id == machine_id, Machine.deleted_at.is_(None)).with_for_update().first()
    if machine is None:
        raise ValidationAppError(f"Machine {machine_id} not found.")
    if machine.status != "active":
        raise ValidationAppError(f"{machine.name} is inactive and cannot be scheduled.")
    return machine


def _occupied_window(row) -> tuple[datetime, datetime]:
    """The [start, end) a schedule row actually occupies on its machine.
    A Production-Order-linked schedule has exact planned_start/
    planned_end; a legacy batch (day-granularity only) is treated as
    occupying its *entire* scheduled_start..scheduled_end span -- the
    only correct assumption when the exact time was never recorded and
    this factory runs a single shared Production Line (see
    app/models/machine.py's docstring / MachineCRUD.create)."""
    if row.planned_start is not None and row.planned_end is not None:
        return row.planned_start, row.planned_end
    return (
        datetime.combine(row.scheduled_start, dt_time.min),
        datetime.combine(row.scheduled_end + timedelta(days=1), dt_time.min),
    )


def _check_conflict(
    db: Session, machine_id: int, start: datetime, end: datetime, exclude_schedule_id: int | None = None
) -> None:
    """Rejects `[start, end)` if it overlaps any other still-occupying
    schedule on this machine -- 'planned'/'in_progress'/'paused' all
    count (capacity_service.BOOKED_PRODUCTION_STATUSES), so a legacy
    batch mid-run blocks a new Production-Order-driven schedule on the
    same machine exactly as another Production-Order schedule would.
    FOR UPDATE on the candidate rows (not just the Machine row locked by
    the caller) is what makes this immune to this app's REPEATABLE READ
    snapshot staleness -- see reserve_stock_within_available's docstring
    for the same reasoning."""
    query = (
        db.query(
            ProductionSchedule.id,
            ProductionSchedule.batch_number,
            ProductionSchedule.planned_start,
            ProductionSchedule.planned_end,
            ProductionSchedule.scheduled_start,
            ProductionSchedule.scheduled_end,
        )
        .filter(
            ProductionSchedule.machine_id == machine_id,
            ProductionSchedule.deleted_at.is_(None),
            ProductionSchedule.status.in_(capacity_service.BOOKED_PRODUCTION_STATUSES),
        )
        .with_for_update()
    )
    if exclude_schedule_id:
        query = query.filter(ProductionSchedule.id != exclude_schedule_id)
    for row in query.all():
        existing_start, existing_end = _occupied_window(row)
        if start < existing_end and existing_start < end:
            raise ConflictError(
                f"Machine already booked by {row.batch_number} from "
                f"{existing_start.strftime('%d %b %Y %H:%M')} to {existing_end.strftime('%d %b %Y %H:%M')}."
            )


def _reject_past_start(planned_start: datetime) -> None:
    if planned_start.date() < today_kuwait():
        raise ValidationAppError(f"Planned start cannot be in the past (today is {today_kuwait().isoformat()}).")


def _compute_planned_end(
    product: Product, planned_quantity: float, planned_start: datetime, requested_end: datetime | None
) -> datetime:
    """Duration = Planned Quantity / Production Rate, using the existing
    rate already on the product (production_hours_per_unit -- the same
    figure capacity_service/feasibility_service already build on) --
    never a rate invented for this pass. If the caller gives an explicit
    planned_end, that's honored as-is (the UI may let a user override
    the computed figure); otherwise a product with no rate configured
    must have one entered manually rather than defaulting to something
    arbitrary."""
    if requested_end is not None:
        return requested_end
    if product.production_hours_per_unit is None:
        raise ValidationAppError(
            f"{product.name} has no production rate configured (hours per unit); enter a planned end manually."
        )
    hours = float(planned_quantity) * float(product.production_hours_per_unit)
    if hours <= 0:
        raise ValidationAppError("Computed production duration must be positive.")
    return planned_start + timedelta(hours=hours)


def create_schedule(db: Session, production_order_id: int, data: dict, user_id: int | None = None) -> ProductionSchedule:
    """Creates a schedule for (some or all of) a Production Order's
    planned quantity. Deliberately NOT gated on material allocation/
    readiness -- this app's own existing convention (production_service.
    create_batch) already lets a batch be planned unconstrained by
    readiness, and only checks it at the planned -> in_progress start
    gate (production_readiness_service, not implemented for this flow in
    P5 since execution doesn't exist yet here). The Production Order's
    material status stays visible alongside the schedule so the user can
    weigh a shortage before committing a machine slot to it -- see spec
    section 1's "choose the simplest rule consistent with the
    application's current business logic."
    """
    po = _lock_production_order(db, production_order_id)
    if po.status != "planned":
        raise ConflictError(f"Cannot schedule a production order in '{po.status}' status; it must be planned.")

    product = db.query(Product).filter(Product.id == po.product_id, Product.deleted_at.is_(None)).first()
    if product is None:
        raise ValidationAppError("This production order's product no longer exists.")
    if product.status != "active":
        raise ValidationAppError(f"{product.name} is inactive and cannot be scheduled.")

    already_scheduled = _scheduled_quantity(db, production_order_id, for_update=True)
    remaining_to_schedule = round(float(po.planned_quantity) - already_scheduled, 4)

    requested_quantity = data.get("planned_quantity")
    planned_quantity = float(requested_quantity) if requested_quantity is not None else remaining_to_schedule
    if planned_quantity <= 0:
        raise ValidationAppError("Planned quantity must be positive.")
    if planned_quantity > remaining_to_schedule:
        raise ValidationAppError(
            f"Scheduled quantity ({planned_quantity}) exceeds this production order's remaining "
            f"unscheduled quantity ({remaining_to_schedule})."
        )

    machine_id = data.get("machine_id") or product.machine_id
    if not machine_id:
        raise ValidationAppError("No machine specified, and this product has no default machine.")
    machine = _lock_machine(db, machine_id)

    planned_start = data["planned_start"]
    _reject_past_start(planned_start)
    planned_end = _compute_planned_end(product, planned_quantity, planned_start, data.get("planned_end"))
    if planned_end <= planned_start:
        raise ValidationAppError("Planned end must be after planned start.")

    _check_conflict(db, machine.id, planned_start, planned_end)

    batch_number = number_series_service.next_number(db, "PRODUCTION_BATCH")
    schedule = ProductionSchedule(
        batch_number=batch_number,
        product_id=product.id,
        machine_id=machine.id,
        order_id=po.order_id,
        production_order_id=production_order_id,
        planned_quantity=planned_quantity,
        scheduled_start=planned_start.date(),
        scheduled_end=planned_end.date(),
        planned_start=planned_start,
        planned_end=planned_end,
        notes=data.get("notes"),
        created_by=user_id,
    )
    db.add(schedule)
    db.flush()
    audit_service.log_create(db, TABLE_NAME, schedule.id, user_id)
    db.commit()
    return get_schedule(db, schedule.id)


def reschedule(db: Session, schedule_id: int, data: dict, user_id: int | None = None) -> ProductionSchedule:
    """Modifies a still-planned schedule's machine/quantity/timing,
    re-running the same conflict and quantity validation a fresh create
    would -- never a silent overwrite. Only 'planned' schedules can be
    touched; once execution exists in a later pass, an in_progress/
    completed schedule must stay protected exactly the same way
    production_service.update_batch already refuses to edit a started
    batch.
    """
    row = _lock_schedule_row(db, schedule_id)
    if row.status != "planned":
        raise ConflictError(f"Only a planned schedule can be modified; this one is '{row.status}'.")

    po = _lock_production_order(db, row.production_order_id)
    if po.status != "planned":
        raise ConflictError(f"Cannot modify a schedule for a production order in '{po.status}' status.")

    product = db.query(Product).filter(Product.id == row.product_id, Product.deleted_at.is_(None)).first()
    if product is None:
        raise ValidationAppError("This schedule's product no longer exists.")

    new_machine_id = data.get("machine_id", row.machine_id)
    if not new_machine_id:
        raise ValidationAppError("No machine specified, and this product has no default machine.")

    new_quantity = float(data.get("planned_quantity", row.planned_quantity))
    if new_quantity <= 0:
        raise ValidationAppError("Planned quantity must be positive.")

    already_scheduled = _scheduled_quantity(db, row.production_order_id, for_update=True, exclude_schedule_id=row.id)
    remaining_to_schedule = round(float(po.planned_quantity) - already_scheduled, 4)
    if new_quantity > remaining_to_schedule:
        raise ValidationAppError(
            f"Scheduled quantity ({new_quantity}) exceeds this production order's remaining "
            f"unscheduled quantity ({remaining_to_schedule})."
        )

    new_start = data.get("planned_start", row.planned_start)
    _reject_past_start(new_start)
    new_end = _compute_planned_end(product, new_quantity, new_start, data.get("planned_end"))
    if new_end <= new_start:
        raise ValidationAppError("Planned end must be after planned start.")

    machine = _lock_machine(db, new_machine_id)
    _check_conflict(db, machine.id, new_start, new_end, exclude_schedule_id=row.id)

    changes: dict[str, tuple] = {}
    update_values = {
        "machine_id": machine.id,
        "planned_quantity": new_quantity,
        "planned_start": new_start,
        "planned_end": new_end,
        "scheduled_start": new_start.date(),
        "scheduled_end": new_end.date(),
        "updated_by": user_id,
    }
    if "notes" in data:
        update_values["notes"] = data["notes"]
    for field in ("machine_id", "planned_quantity", "planned_start", "planned_end"):
        old_value = getattr(row, field)
        if old_value != update_values[field]:
            changes[field] = (old_value, update_values[field])

    db.query(ProductionSchedule).filter(ProductionSchedule.id == row.id).update(update_values)
    audit_service.log_update(db, TABLE_NAME, row.id, changes, user_id)
    db.commit()
    return get_schedule(db, row.id)


def cancel_schedule(db: Session, schedule_id: int, reason: str | None, user_id: int | None = None) -> ProductionSchedule:
    """Cancels a schedule -- frees the machine slot and drops out of the
    Production Order's scheduled_quantity total, nothing else. Never
    releases a material reservation (there isn't one to release -- see
    this module's own docstring) and, unlike create_schedule/reschedule,
    is NOT gated on the Production Order's own status: a Production
    Order cancelled after being scheduled still needs its now-pointless
    schedule cleared off the machine's calendar, the same reasoning
    production_order_material_service.release documents for staying
    available after a Production Order is cancelled.
    """
    row = _lock_schedule_row(db, schedule_id)
    assert_transition_allowed(ALLOWED_TRANSITIONS, row.status, "cancelled", "production schedule")
    assert_reason_given(reason, "A reason is required to cancel a production schedule.")

    db.query(ProductionSchedule).filter(ProductionSchedule.id == row.id).update(
        {"status": "cancelled", "cancel_reason": reason, "updated_by": user_id}
    )
    audit_service.log_update(db, TABLE_NAME, row.id, {"status": (row.status, "cancelled")}, user_id)
    db.commit()
    return get_schedule(db, row.id)
