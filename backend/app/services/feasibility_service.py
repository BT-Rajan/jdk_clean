import json
from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy.orm import Session, joinedload

from app.core.exceptions import ConflictError, NotFoundError, ValidationAppError
from app.core.pagination import sort_and_paginate
from app.core.workflow import assert_reason_given, assert_transition_allowed
from app.models.customer import Customer
from app.models.feasibility import (
    ALLOWED_TRANSITIONS,
    OPEN_STATUSES,
    QUOTABLE_STATUSES,
    FeasibilityCheck,
    FeasibilityLine,
)
from app.models.machine import Machine
from app.models.product import Product
from app.models.production_schedule import ProductionSchedule
from app.models.raw_material import RawMaterial
from app.services import audit_service, bom_service, capacity_service, deal_service, inventory_service, number_series_service, settings_service

TABLE_NAME = "feasibility_checks"

# Kuwait is UTC+3 year-round (no DST) -- a fixed offset rather than a
# zoneinfo/tzdata lookup, so this doesn't depend on the OS/container
# having a timezone database installed.
KUWAIT_TZ = timezone(timedelta(hours=3))

# A feasibility check open (not closed/converted) longer than this many days
# gets flagged for admin review by escalate_stale_feasibility_checks.
STALE_AFTER_DAYS = 5

# See capacity_service.py -- the vacant-slot scan itself now lives there,
# shared with order_service's auto-scheduling on order confirm.
BOOKED_PRODUCTION_STATUSES = capacity_service.BOOKED_PRODUCTION_STATUSES


def _base_query(db: Session, include_deleted: bool = False):
    query = db.query(FeasibilityCheck).options(
        joinedload(FeasibilityCheck.customer),
        joinedload(FeasibilityCheck.lines).joinedload(FeasibilityLine.product),
    )
    if not include_deleted:
        query = query.filter(FeasibilityCheck.deleted_at.is_(None))
    return query


def _expiry_deadline_kuwait(feasibility: FeasibilityCheck) -> datetime | None:
    """11:59pm Kuwait time on the Kuwait calendar day `feasibility` was
    generated -- None if created_at somehow isn't set yet (shouldn't
    happen post-creation, but this is read on every fetch so it's worth
    being defensive)."""
    if feasibility.created_at is None:
        return None
    created_at = feasibility.created_at
    created_utc = created_at if created_at.tzinfo else created_at.replace(tzinfo=timezone.utc)
    generated_date_kuwait = created_utc.astimezone(KUWAIT_TZ).date()
    return datetime.combine(generated_date_kuwait, time(23, 59, 59), tzinfo=KUWAIT_TZ)


def _expire_if_due(db: Session, feasibility: FeasibilityCheck) -> bool:
    """Expires a single check in place, right now, if it's open and past
    its Kuwait-time cutoff -- called on every read/action path (not just
    the periodic scan in core/scheduler.py) so a check never *displays*
    or *acts* on a status that's already a few hours stale. The periodic
    scan still exists to catch checks nobody happens to look at."""
    if feasibility.deleted_at is not None or feasibility.status not in OPEN_STATUSES:
        return False
    deadline = _expiry_deadline_kuwait(feasibility)
    if deadline is None:
        return False
    if datetime.now(timezone.utc).astimezone(KUWAIT_TZ) <= deadline:
        return False

    old_status = feasibility.status
    feasibility.status = "expired"
    audit_service.log_update(db, TABLE_NAME, feasibility.id, {"status": (old_status, "expired")}, None)
    db.commit()
    deal_service.reconcile_deal_status(db, feasibility.deal_id, None)
    return True


def get_feasibility(db: Session, feasibility_id: int, include_deleted: bool = False) -> FeasibilityCheck:
    obj = _base_query(db, include_deleted).filter(FeasibilityCheck.id == feasibility_id).first()
    if obj is None:
        raise NotFoundError("Feasibility check")
    _expire_if_due(db, obj)
    return obj


_SORTABLE_FIELDS = {
    "feasibility_number": FeasibilityCheck.feasibility_number,
    "status": FeasibilityCheck.status,
    "created_at": FeasibilityCheck.created_at,
}


def list_feasibility_checks(
    db: Session,
    page: int = 1,
    page_size: int = 25,
    search: str | None = None,
    status: str | None = None,
    customer_id: int | None = None,
    sort: str | None = None,
) -> dict:
    query = _base_query(db)
    if status:
        query = query.filter(FeasibilityCheck.status == status)
    if customer_id:
        query = query.filter(FeasibilityCheck.customer_id == customer_id)
    if search:
        like = f"%{search}%"
        query = query.join(Customer).filter(
            (FeasibilityCheck.feasibility_number.ilike(like)) | (Customer.name.ilike(like))
        )
    result = sort_and_paginate(query, FeasibilityCheck, _SORTABLE_FIELDS, sort, page, page_size)
    # Same reasoning as get_feasibility: correct this page's statuses in
    # place rather than only relying on the periodic scan, so a list view
    # never shows a status that's already past its Kuwait-time cutoff.
    for item in result["items"]:
        _expire_if_due(db, item)
    return result


def create_feasibility(db: Session, data: dict, user_id: int | None = None) -> FeasibilityCheck:
    customer = (
        db.query(Customer)
        .filter(Customer.id == data["customer_id"], Customer.deleted_at.is_(None))
        .first()
    )
    if customer is None:
        raise ValidationAppError(f"Customer {data['customer_id']} not found.")

    lines_in = []
    for line in data.pop("lines"):
        product = (
            db.query(Product)
            .filter(Product.id == line["product_id"], Product.deleted_at.is_(None))
            .first()
        )
        if product is None:
            raise ValidationAppError(f"Product {line['product_id']} not found.")
        lines_in.append(line)

    feasibility_number = number_series_service.next_number(db, "FEASIBILITY")
    deal = deal_service.get_or_create_for_new_stage(
        db,
        deal_id=data.pop("deal_id", None),
        customer_id=data["customer_id"],
        stage="feasibility",
        user_id=user_id,
    )
    feasibility = FeasibilityCheck(
        feasibility_number=feasibility_number,
        deal_id=deal.id,
        created_by=user_id,
        **data,
    )
    feasibility.lines = [FeasibilityLine(**line) for line in lines_in]

    db.add(feasibility)
    db.flush()
    audit_service.log_create(db, TABLE_NAME, feasibility.id, user_id)
    db.commit()
    db.refresh(feasibility)
    return get_feasibility(db, feasibility.id)


def _daily_booked_hours(batches, hours_field: str = "machine"):
    return capacity_service.daily_booked_hours(batches, hours_field)


def _find_vacant_slot_completion(daily_capacity, daily_booked, required_hours, today, working_days=None):
    return capacity_service.find_vacant_slot_completion(daily_capacity, daily_booked, required_hours, today, working_days)


def _check_capacity(
    db: Session,
    product: Product,
    quantity: float,
    required_by_date: date | None,
    today: date,
    working_days: set[int],
) -> tuple[bool | None, dict | None, date | None]:
    """Machine-availability + time-required (+ labor) estimate for one
    line: scans forward for the first vacant slot -- on the product's
    machine, and in the factory's shared worker pool -- with enough free
    capacity to produce `quantity` units at the product's formula
    (production_hours_per_unit, workers_required), net of what's already
    booked in production_schedules.

    The scan always starts from the next working day after `today` --
    today itself is never counted (whatever capacity exists today is
    already spoken for), and weekends/off-days per `working_days` are
    skipped entirely -- so the estimate always reflects a day the
    factory can actually start fresh work on.

    Returns (capacity_ok, shortfall_dict, estimated_ready_date):
    - estimated_ready_date is the projected completion date, always
      computed when the product has a machine/time formula, regardless
      of whether required_by_date was given -- this is what lets Sales
      see *when* the remainder can be supplied, not just pass/fail.
    - capacity_ok is the pass/fail verdict against required_by_date;
      None when there's nothing to compare against (no required_by_date)
      or nothing to evaluate (no machine/time formula on the product) --
      "not evaluable" either way.
    """
    if product.machine_id is None or product.production_hours_per_unit is None:
        return None, None, None

    machine = db.query(Machine).filter(Machine.id == product.machine_id).first()
    if machine is None:
        return None, None, None

    scan_start = settings_service.next_working_day(today, working_days)
    required_hours = round(float(quantity) * float(product.production_hours_per_unit), 4)

    # Machine slot: only this machine's own bookings compete for its time.
    machine_batches = (
        db.query(ProductionSchedule)
        .options(joinedload(ProductionSchedule.product))
        .filter(
            ProductionSchedule.machine_id == machine.id,
            ProductionSchedule.deleted_at.is_(None),
            ProductionSchedule.status.in_(BOOKED_PRODUCTION_STATUSES),
            ProductionSchedule.scheduled_end >= scan_start,
        )
        .all()
    )
    machine_daily_booked = _daily_booked_hours(machine_batches, hours_field="machine")
    machine_completion = _find_vacant_slot_completion(
        float(machine.capacity_hours_per_day), machine_daily_booked, required_hours, scan_start, working_days
    )

    # Worker slot: every batch factory-wide competes for the shared pool,
    # not just this machine's -- workers move between machines.
    worker_completion = scan_start
    workers_required = product.workers_required
    required_worker_hours = None
    total_workers, workday_hours = settings_service.get_factory_labor_pool(db)
    if workers_required and total_workers > 0:
        required_worker_hours = round(required_hours * workers_required, 4)
        worker_batches = (
            db.query(ProductionSchedule)
            .options(joinedload(ProductionSchedule.product))
            .filter(
                ProductionSchedule.deleted_at.is_(None),
                ProductionSchedule.status.in_(BOOKED_PRODUCTION_STATUSES),
                ProductionSchedule.scheduled_end >= scan_start,
            )
            .all()
        )
        worker_daily_booked = _daily_booked_hours(worker_batches, hours_field="workers")
        worker_completion = _find_vacant_slot_completion(
            total_workers * workday_hours, worker_daily_booked, required_worker_hours, scan_start, working_days
        )
    elif workers_required and total_workers == 0:
        # Workers required by the formula but no factory-wide pool
        # configured (Settings -> factory_total_workers) -- can't evaluate
        # that half of the check, so don't silently pass it.
        worker_completion = None

    if machine_completion is None or worker_completion is None:
        # Not achievable within the scan window on at least one axis.
        projected_completion = None
    else:
        projected_completion = max(machine_completion, worker_completion)

    capacity_ok = None
    if required_by_date is not None:
        capacity_ok = projected_completion is not None and projected_completion <= required_by_date

    if capacity_ok is False:
        return False, {
            "machine": f"{machine.code} — {machine.name}",
            "required_hours": required_hours,
            "projected_completion_date": projected_completion.isoformat() if projected_completion else None,
            "shortfall_days": (
                (projected_completion - required_by_date).days if projected_completion else None
            ),
            "workers_required": workers_required,
            "required_worker_hours": required_worker_hours,
        }, projected_completion

    return capacity_ok, None, projected_completion


def run_check(db: Session, feasibility_id: int, user_id: int | None = None) -> FeasibilityCheck:
    """Tries to manufacture every line's product from raw materials
    currently in inventory, AND checks that the product's machine has
    enough free time (net of what's already booked in
    production_schedules) to produce the quantity before required_by_date.
    All lines clear on both counts -> 'feasible'; any shortfall on either
    count, on any line -> 'exception_pending', requiring Sales' exception
    approval before a quotation can be raised against this check.
    """
    feasibility = get_feasibility(db, feasibility_id)
    if feasibility.status != "draft":
        raise ConflictError(
            f"Only a draft feasibility check can be run (current status: '{feasibility.status}')."
        )

    today = datetime.now(timezone.utc).date()
    working_days = settings_service.get_working_days(db)
    all_feasible = True
    for line in feasibility.lines:
        requested_qty = float(line.quantity)

        # Net off finished-goods already sitting in stock (unreserved --
        # inventory_service.get_stock's quantity_available already
        # excludes anything held for other orders) before figuring out
        # what actually needs producing. This is what makes units left
        # over from a cancelled order (see order_service.
        # _cancel_active_production_batches) genuinely reusable instead
        # of every new request re-deriving fresh raw-material and machine
        # -time requirements for materials that were, in reality, already
        # consumed to make product that's just sitting there unclaimed.
        finished_stock = inventory_service.get_stock(db, "product", line.product_id)
        covered_by_stock = round(min(requested_qty, max(finished_stock["quantity_available"], 0.0)), 4)
        quantity_to_produce = round(requested_qty - covered_by_stock, 4)
        line.covered_by_stock = covered_by_stock if covered_by_stock > 0 else None

        if quantity_to_produce <= 0:
            # Fully covered by existing stock -- nothing to produce, so
            # nothing to check materials or machine time for, and it's
            # ready right now.
            line.is_feasible = True
            line.bom_missing = None
            line.shortfall_json = None
            line.capacity_ok = None
            line.capacity_shortfall_json = None
            line.estimated_ready_date = today
            continue

        if not bom_service.has_bom(db, line.product_id):
            # Distinct from a BOM that resolves to zero requirements:
            # this product has no formula configured at all, so there's
            # nothing to actually verify against. Forced infeasible
            # (not silently passed) -- same defensive stance as a
            # missing machine/time formula being treated as "not
            # evaluable" rather than "fine", except here the missing
            # data blocks the raw-material check specifically, so the
            # line can't be allowed through without Sales explicitly
            # overriding it.
            line.is_feasible = False
            line.bom_missing = True
            line.shortfall_json = None
            line.capacity_ok = None
            line.capacity_shortfall_json = None
            line.estimated_ready_date = None
            all_feasible = False
            continue

        line.bom_missing = None
        requirements = bom_service.explode_requirements(db, line.product_id, quantity_to_produce)
        shortfalls: list[dict] = []
        for raw_material_id, required_qty in requirements.items():
            stock = inventory_service.get_stock(db, "raw_material", raw_material_id)
            available = stock["quantity_available"]
            if available < required_qty:
                material = db.query(RawMaterial).filter(RawMaterial.id == raw_material_id).first()
                shortfalls.append(
                    {
                        "raw_material_id": raw_material_id,
                        "code": material.code if material else f"#{raw_material_id}",
                        "name": material.name if material else "Unknown material",
                        "unit": material.unit if material else "",
                        "required": required_qty,
                        "on_hand": available,
                        "shortfall": round(required_qty - available, 4),
                    }
                )

        line.is_feasible = not shortfalls
        line.shortfall_json = json.dumps(shortfalls) if shortfalls else None

        if shortfalls:
            # Raw materials are short -- production can't be scheduled off
            # a supply that doesn't exist yet, so there's nothing honest to
            # tell Sales about a finish date until Procurement resolves the
            # shortfall (see the MRP report / purchase-order flow). Machine
            # time genuinely isn't evaluable in that state.
            line.capacity_ok = None
            line.capacity_shortfall_json = None
            line.estimated_ready_date = None
        else:
            capacity_ok, capacity_shortfall, estimated_ready_date = _check_capacity(
                db, line.product, quantity_to_produce, feasibility.required_by_date, today, working_days
            )
            line.capacity_ok = capacity_ok
            line.capacity_shortfall_json = json.dumps(capacity_shortfall) if capacity_shortfall else None
            line.estimated_ready_date = estimated_ready_date
            if capacity_ok is False:
                all_feasible = False

        if shortfalls:
            all_feasible = False

    old_status = feasibility.status
    new_status = "feasible" if all_feasible else "exception_pending"
    feasibility.status = new_status
    feasibility.checked_at = datetime.now(timezone.utc)
    feasibility.updated_by = user_id
    audit_service.log_update(
        db, TABLE_NAME, feasibility_id, {"status": (old_status, new_status)}, user_id
    )
    db.commit()

    if new_status == "feasible":
        _maybe_auto_create_quotation(db, feasibility_id, user_id)

    return get_feasibility(db, feasibility_id)


def decide_exception(
    db: Session, feasibility_id: int, approve: bool, reason: str, user_id: int | None = None
) -> FeasibilityCheck:
    """Sales' call on a feasibility check that came back short on raw
    materials: approve the exception to let it proceed to quotation
    despite the shortfall (this is the "override" -- proceeding with an
    infeasible result on Sales' own judgement, with `reason` as the
    mandatory comment explaining why), or reject it (which still requires
    a separate close_reason via close_feasibility to actually terminate
    it, keeping 'why we didn't proceed' explicit at both steps).

    Approving flags the check for admin review -- every override needs an
    admin to see it, the same way an overdue order does (see
    order_service.escalate_overdue_orders / admin_review_required).
    """
    feasibility = get_feasibility(db, feasibility_id)
    if feasibility.status != "exception_pending":
        raise ConflictError(
            f"No exception is pending on this feasibility check (current status: "
            f"'{feasibility.status}')."
        )

    new_status = "exception_approved" if approve else "exception_rejected"
    old_status = feasibility.status
    feasibility.status = new_status
    feasibility.exception_reason = reason
    feasibility.exception_by = user_id
    feasibility.updated_by = user_id
    if approve:
        feasibility.admin_review_required = True
        feasibility.admin_review_reason = "override"
        feasibility.admin_reviewed_at = None
        feasibility.admin_reviewed_by = None
        feasibility.admin_review_notes = None
    audit_service.log_update(
        db, TABLE_NAME, feasibility_id, {"status": (old_status, new_status)}, user_id
    )
    db.commit()

    if new_status == "exception_approved":
        _maybe_auto_create_quotation(db, feasibility_id, user_id)
    elif new_status == "exception_rejected":
        deal_service.reconcile_deal_status(db, feasibility.deal_id, user_id)

    return get_feasibility(db, feasibility_id)


def _maybe_auto_create_quotation(db: Session, feasibility_id: int, user_id: int | None = None) -> None:
    """Fires the moment a check turns feasible (run_check) or Sales
    overrides an infeasible result (decide_exception, approved) -- the
    "auto create, with role-based flexibility" behavior: if enabled (see
    Settings -> Sales, admin/manager-only to change), drafts a quotation
    right then, pre-filled from the check's own lines, on the same deal.
    If disabled, does nothing -- Sales creates the quotation by hand from
    the feasibility check as before, exactly like the old flow.

    Never raises: an auto-create failure (disabled, or any edge case)
    should never break the feasibility action that triggered it. The
    drafted quotation is a completely normal draft afterward -- Sales can
    edit or delete it like any other; nothing about it is locked in.
    """
    if not settings_service.is_auto_create_quotation_enabled(db):
        return

    # Local import: quotation_service already imports feasibility_service
    # at module level (to call mark_converted), so importing it back here
    # at module level would be circular.
    from app.services import quotation_service

    feasibility = get_feasibility(db, feasibility_id)

    lines = []
    for line in feasibility.lines:
        product = line.product
        lines.append(
            {
                "product_id": line.product_id,
                "quantity": float(line.quantity),
                "unit_price": float(product.selling_price) if product else 0.0,
            }
        )
    if not lines:
        return

    try:
        quotation_service.create_quotation(
            db,
            {
                "customer_id": feasibility.customer_id,
                "deal_id": feasibility.deal_id,
                "feasibility_id": feasibility.id,
                "quotation_date": datetime.now(timezone.utc).date(),
                "valid_until": None,
                "notes": f"Auto-created from feasibility check {feasibility.feasibility_number}.",
                "auto_created": True,
                "lines": lines,
            },
            user_id=user_id,
        )
    except (ConflictError, ValidationAppError):
        # Already converted, or some other reason it's not quotable right
        # now -- fine, this is a best-effort convenience, not a hard
        # requirement. Sales can still create one by hand.
        pass


def revive_feasibility(db: Session, feasibility_id: int, user_id: int | None = None) -> FeasibilityCheck:
    """Sales reviving a feasibility check that reached a dead end --
    converted (a quotation was raised, but it was later rejected/expired
    and nothing came of it), closed without quoting, expired without
    ever being converted, or an exception Sales rejected -- so it can be
    run and quoted from again. There's no limit on how many times: each
    revive resets the check back to 'draft', clearing every prior
    verdict, so a fresh run_check verifies current stock/capacity/BOM
    from scratch rather than re-opening a stale result -- conditions may
    genuinely have changed since the first attempt. Every subsequent
    quotation created from it (whether auto-created or by hand) is
    simply another row pointing at the same feasibility_id; there's no
    uniqueness constraint stopping that. created_at is reset to now --
    a revive is treated as a fresh generation, so the check gets a full
    new same-day expiry window (11:59pm Kuwait time *today*) rather than
    being immediately re-expired on the next scan for a deadline that
    already passed; this also restarts its 5-day stale-review clock.
    """
    feasibility = get_feasibility(db, feasibility_id)
    revivable = ("converted", "closed", "exception_rejected", "expired")
    if feasibility.status not in revivable:
        raise ConflictError(
            f"Only a converted, closed, expired, or rejected feasibility check can be revived "
            f"(current status: '{feasibility.status}')."
        )

    old_status = feasibility.status
    feasibility.status = "draft"
    feasibility.created_at = datetime.now(timezone.utc)
    feasibility.checked_at = None
    feasibility.exception_reason = None
    feasibility.exception_by = None
    feasibility.close_reason = None
    feasibility.admin_review_required = False
    feasibility.admin_review_reason = None
    feasibility.admin_reviewed_at = None
    feasibility.admin_reviewed_by = None
    feasibility.admin_review_notes = None
    feasibility.updated_by = user_id
    for line in feasibility.lines:
        line.is_feasible = None
        line.shortfall_json = None
        line.capacity_ok = None
        line.capacity_shortfall_json = None
        line.covered_by_stock = None
        line.bom_missing = None

    audit_service.log_update(
        db, TABLE_NAME, feasibility_id, {"status": (old_status, "draft")}, user_id
    )
    db.commit()

    deal_service.reopen_deal(db, feasibility.deal_id, user_id)

    return get_feasibility(db, feasibility_id)


def close_feasibility(db: Session, feasibility_id: int, reason: str, user_id: int | None = None) -> FeasibilityCheck:
    """Sales closing a feasible/exception-approved/exception-rejected check
    without ever generating a quotation from it. A reason is mandatory."""
    feasibility = get_feasibility(db, feasibility_id)
    assert_transition_allowed(ALLOWED_TRANSITIONS, feasibility.status, "closed", "feasibility check")
    assert_reason_given(reason, "A reason is required to close a feasibility check.")

    old_status = feasibility.status
    feasibility.status = "closed"
    feasibility.close_reason = reason
    feasibility.updated_by = user_id
    audit_service.log_update(
        db, TABLE_NAME, feasibility_id, {"status": (old_status, "closed")}, user_id
    )
    db.commit()

    deal_service.reconcile_deal_status(db, feasibility.deal_id, user_id)

    return get_feasibility(db, feasibility_id)


def escalate_stale_feasibility_checks(db: Session, as_of: date | None = None) -> list[FeasibilityCheck]:
    """Flags every feasibility check that's been open (not closed or
    converted) for more than STALE_AFTER_DAYS, for admin attention. Meant
    to be run periodically (e.g. an external cron hitting the scan
    endpoint daily); idempotent -- re-running only (re)flags checks that
    still qualify. Mirrors order_service.escalate_overdue_orders exactly.
    """
    today = as_of or datetime.now(timezone.utc).date()
    cutoff = today - timedelta(days=STALE_AFTER_DAYS)

    candidates = (
        db.query(FeasibilityCheck)
        .filter(
            FeasibilityCheck.deleted_at.is_(None),
            FeasibilityCheck.status.in_(OPEN_STATUSES),
            FeasibilityCheck.admin_review_required.is_(False),
        )
        .all()
    )

    flagged: list[FeasibilityCheck] = []
    for feasibility in candidates:
        created_date = feasibility.created_at.date() if feasibility.created_at else today
        if created_date <= cutoff:
            feasibility.admin_review_required = True
            feasibility.admin_review_reason = "stale_open"
            audit_service.log_update(
                db, TABLE_NAME, feasibility.id, {"admin_review_required": (False, True)}, None
            )
            flagged.append(feasibility)

    if flagged:
        db.commit()
    return flagged


def escalate_expired_feasibility_checks(db: Session, as_of: datetime | None = None) -> list[FeasibilityCheck]:
    """Expires every feasibility check not yet converted to a quotation
    by 11:59pm Kuwait time on the calendar day it was generated
    (created_at, read in Kuwait local time -- 'the day it was generated'
    means Kuwait's day, not UTC's, so a check created just before
    midnight UTC doesn't get an extra few hours or lose them). Reachable
    from any open status (draft, feasible, exception_pending,
    exception_approved, exception_rejected) -- wherever it was sitting
    in the workflow when its day ended. Closed/converted checks are
    already terminal and untouched here; an already-expired check is
    excluded by the status filter on the next run, same idempotent
    pattern as escalate_stale_feasibility_checks and quotation_service.
    escalate_expired_quotations.

    Meant to be run periodically -- see core/scheduler.py, which runs
    this (and the other scan/escalate checks) every 6 hours, frequent
    enough that nothing sits unexpired for long past its actual cutoff.
    """
    now_utc = as_of or datetime.now(timezone.utc)
    if now_utc.tzinfo is None:
        now_utc = now_utc.replace(tzinfo=timezone.utc)
    now_kuwait = now_utc.astimezone(KUWAIT_TZ)

    candidates = (
        db.query(FeasibilityCheck)
        .filter(
            FeasibilityCheck.deleted_at.is_(None),
            FeasibilityCheck.status.in_(OPEN_STATUSES),
        )
        .all()
    )

    expired: list[FeasibilityCheck] = []
    for feasibility in candidates:
        deadline_kuwait = _expiry_deadline_kuwait(feasibility)
        if deadline_kuwait is None:
            continue

        if now_kuwait > deadline_kuwait:
            old_status = feasibility.status
            feasibility.status = "expired"
            audit_service.log_update(
                db, TABLE_NAME, feasibility.id, {"status": (old_status, "expired")}, None
            )
            expired.append(feasibility)

    if expired:
        db.commit()
        for feasibility in expired:
            deal_service.reconcile_deal_status(db, feasibility.deal_id, None)
        db.commit()
    return expired


def admin_review(db: Session, feasibility_id: int, notes: str, user_id: int | None = None) -> FeasibilityCheck:
    """Admin clears a pending override/stale-open escalation, recording
    their decision. Mirrors order_service.admin_review exactly."""
    feasibility = get_feasibility(db, feasibility_id)
    if not feasibility.admin_review_required:
        raise ConflictError("This feasibility check has no pending admin review.")

    feasibility.admin_review_required = False
    feasibility.admin_reviewed_at = datetime.now(timezone.utc)
    feasibility.admin_reviewed_by = user_id
    feasibility.admin_review_notes = notes
    feasibility.updated_by = user_id
    audit_service.log_update(
        db, TABLE_NAME, feasibility_id, {"admin_review_required": (True, False)}, user_id
    )
    db.commit()
    return get_feasibility(db, feasibility_id)


def list_available_for_quotation(db: Session, customer_id: int | None = None) -> list[FeasibilityCheck]:
    """List feasibility checks available for quotation generation.
    Only returns checks in quotable statuses (feasible, exception_approved)
    that haven't been converted, closed, or expired."""
    query = _base_query(db).filter(FeasibilityCheck.status.in_(QUOTABLE_STATUSES))
    if customer_id:
        query = query.filter(FeasibilityCheck.customer_id == customer_id)
    candidates = query.order_by(FeasibilityCheck.feasibility_number.desc()).all()
    # Same reasoning as get_feasibility/list_feasibility_checks: a check
    # can be sitting in a quotable status but already past its Kuwait
    # cutoff if the periodic scan hasn't reached it yet -- never offer
    # one of those for quoting.
    return [f for f in candidates if not _expire_if_due(db, f)]


def mark_converted(db: Session, feasibility_id: int, user_id: int | None = None) -> None:
    """Called by quotation_service.create_quotation once it has validated
    this feasibility check is quotable; not exposed as its own endpoint."""
    feasibility = get_feasibility(db, feasibility_id)
    if feasibility.status not in QUOTABLE_STATUSES:
        raise ConflictError(
            f"Feasibility check '{feasibility.feasibility_number}' is not in a quotable status "
            f"(current status: '{feasibility.status}')."
        )
    old_status = feasibility.status
    feasibility.status = "converted"
    feasibility.updated_by = user_id
    audit_service.log_update(
        db, TABLE_NAME, feasibility_id, {"status": (old_status, "converted")}, user_id
    )


def delete_feasibility(db: Session, feasibility_id: int, user_id: int | None = None) -> None:
    feasibility = get_feasibility(db, feasibility_id)
    if feasibility.status == "converted":
        raise ConflictError("This feasibility check has been converted to a quotation and cannot be deleted.")
    feasibility.deleted_at = datetime.now(timezone.utc)
    audit_service.log_delete(db, TABLE_NAME, feasibility_id, user_id)
    db.commit()


def restore_feasibility(db: Session, feasibility_id: int, user_id: int | None = None) -> FeasibilityCheck:
    feasibility = get_feasibility(db, feasibility_id, include_deleted=True)
    feasibility.deleted_at = None
    audit_service.log_restore(db, TABLE_NAME, feasibility_id, user_id)
    db.commit()
    return get_feasibility(db, feasibility_id)
