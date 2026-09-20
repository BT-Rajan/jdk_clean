from datetime import date, timedelta

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.core.exceptions import ConflictError, NotFoundError, ValidationAppError
from app.core.sales_scope import scope_by_customer
from app.core.timezone import now_kuwait_naive
from app.core.workflow import assert_reason_given
from app.models.customer import Customer
from app.models.order import Order
from app.models.payment import Payment
from app.services import audit_service

TABLE_NAME = "payments"

# Orders that don't (yet, or ever will) owe anything: a draft hasn't
# committed to anything yet, and a cancelled order's balance is moot.
# Every other status still counts toward what a customer owes, whether
# or not it's been delivered -- delivery and payment are independent.
_BALANCE_EXCLUDED_STATUSES = ("draft", "cancelled")

# A payment method that doesn't require a reference -- anything else
# (bank transfer, cheque, card, or an unspecified method) needs one, per
# create_payment's mandatory-reference rule below.
_NO_REFERENCE_REQUIRED_METHOD = "cash"

# Tolerance for float rounding when comparing amounts against a total --
# same shape as production_service.QUANTITY_DISCREPANCY_TOLERANCE.
_AMOUNT_TOLERANCE = 0.01


def _base_query(db: Session, include_deleted: bool = False):
    query = db.query(Payment).options(
        joinedload(Payment.order),
        joinedload(Payment.customer),
        joinedload(Payment.creator),
    )
    if not include_deleted:
        query = query.filter(Payment.deleted_at.is_(None))
    return query


def get_payment(db: Session, payment_id: int, include_deleted: bool = False) -> Payment:
    obj = _base_query(db, include_deleted).filter(Payment.id == payment_id).first()
    if obj is None:
        raise NotFoundError("Payment")
    return obj


def _get_order(db: Session, order_id: int) -> Order:
    order = db.query(Order).filter(Order.id == order_id, Order.deleted_at.is_(None)).first()
    if order is None:
        raise ValidationAppError(f"Order {order_id} not found.")
    return order


def list_payments_for_order(db: Session, order_id: int) -> list[Payment]:
    _get_order(db, order_id)
    return (
        _base_query(db)
        .filter(Payment.order_id == order_id)
        .order_by(Payment.payment_date.desc(), Payment.id.desc())
        .all()
    )


def get_order_amount_paid(db: Session, order_id: int) -> float:
    total = (
        db.query(func.coalesce(func.sum(Payment.amount), 0))
        .filter(Payment.order_id == order_id, Payment.deleted_at.is_(None))
        .scalar()
    )
    return float(total)


def get_customer_outstanding_balance(
    db: Session, customer_id: int, exclude_order_id: int | None = None
) -> float:
    """What this customer currently owes: sum across their non-draft,
    non-cancelled orders of (total_amount - amount_paid), floored at 0
    per order (an overpayment on one order never offsets what's owed on
    another). `exclude_order_id` leaves one specific order out -- used
    when checking whether confirming that order would itself push the
    customer over their limit, so it isn't counted against its own check.
    """
    orders = (
        db.query(Order)
        .filter(
            Order.customer_id == customer_id,
            Order.deleted_at.is_(None),
            Order.status.notin_(_BALANCE_EXCLUDED_STATUSES),
        )
        .all()
    )
    total = 0.0
    for order in orders:
        if exclude_order_id is not None and order.id == exclude_order_id:
            continue
        paid = get_order_amount_paid(db, order.id)
        total += max(float(order.total_amount) - paid, 0.0)
    return round(total, 2)


def get_customer_credit_status(db: Session, customer_id: int) -> dict:
    customer = db.query(Customer).filter(Customer.id == customer_id, Customer.deleted_at.is_(None)).first()
    if customer is None:
        raise NotFoundError("Customer")
    limit = float(customer.credit_limit)
    # 0 is the field's default for a customer nobody has set a limit for
    # yet -- treated as "not enforced" rather than "may buy nothing", so
    # turning this feature on doesn't retroactively block every existing
    # customer that predates it (see order_service.change_status).
    enforced = limit > 0
    outstanding = get_customer_outstanding_balance(db, customer_id)
    return {
        "customer_id": customer_id,
        "credit_limit": limit,
        "limit_enforced": enforced,
        "outstanding_balance": outstanding,
        "available_credit": round(limit - outstanding, 2) if enforced else None,
        # See order_service.change_status: confirming an order that
        # relies on credit is blocked until this is true.
        "id_verified": customer.id_verified,
    }


def get_order_amount_acknowledged(db: Session, order_id: int) -> float:
    """Sum of only the payments Finance has actually confirmed landed --
    see Payment.acknowledged_at's own docstring. This, not
    get_order_amount_paid (every claim, confirmed or not), is what
    unblocks production for a non-credit order (get_production_payment_
    block_reason) and what a payment plan's completion is measured
    against (payment_plan_service.complete_payment_plan)."""
    total = (
        db.query(func.coalesce(func.sum(Payment.amount), 0))
        .filter(
            Payment.order_id == order_id,
            Payment.deleted_at.is_(None),
            Payment.acknowledged_at.isnot(None),
        )
        .scalar()
    )
    return float(total)


def get_payment_due_date(order: Order) -> date:
    """Automatically derived from the customer's own payment terms --
    confirmed_at (the moment this order actually committed to paying)
    if it's been confirmed yet, else order_date, plus payment_terms_days
    calendar days."""
    base = (order.confirmed_at.date() if order.confirmed_at else order.order_date)
    return base + timedelta(days=int(order.customer.payment_terms_days))


def get_order_payment_status(db: Session, order: Order, as_of: date | None = None) -> dict:
    """Total/paid/acknowledged/outstanding for one order, plus its
    automatically-derived due date and overdue days, and whether it's
    currently blocking production start (see get_production_payment_
    block_reason). The single source the order detail page, the
    collection queue, and the production-start gate all read from.
    """
    as_of = as_of or now_kuwait_naive().date()
    total = float(order.total_amount)
    paid = get_order_amount_paid(db, order.id)
    acknowledged = get_order_amount_acknowledged(db, order.id)
    outstanding = round(max(total - acknowledged, 0.0), 2)
    due_date = get_payment_due_date(order)
    overdue_days = max((as_of - due_date).days, 0) if outstanding > _AMOUNT_TOLERANCE else 0
    return {
        "order_id": order.id,
        "total_amount": total,
        "amount_paid": round(paid, 2),
        "amount_acknowledged": round(acknowledged, 2),
        "outstanding_balance": outstanding,
        "due_date": due_date,
        "overdue_days": overdue_days,
        "has_credit_facility": float(order.customer.credit_limit) > 0,
        "production_block_reason": get_production_payment_block_reason(db, order),
        "payment_override_at": order.payment_override_at,
        "payment_override_reason": order.payment_override_reason,
        "payment_followup_owner_id": order.payment_followup_owner_id,
        "payment_followup_owner_name": order.payment_followup_owner.full_name if order.payment_followup_owner else None,
        "payment_followup_date": order.payment_followup_date,
    }


def get_production_payment_block_reason(db: Session, order: Order) -> str | None:
    """None if production may start for this order right now, otherwise
    the reason it can't. Per the business rule this company runs on:
    orders are only produced once paid, UNLESS the customer has been
    extended credit by an admin (credit_limit > 0), in which case the
    existing credit-limit-at-confirm check (order_service.
    get_confirm_block_reasons) is what governs their exposure instead --
    this gate doesn't apply to them at all.

    For a non-credit ("cash") customer, this is blocked until the order
    is paid in full (by acknowledged amount, not just claimed) or Finance
    has recorded an explicit override (see override_payment_gate) --
    once overridden, it stays cleared for this order.
    """
    if float(order.customer.credit_limit) > 0:
        return None
    if order.payment_override_at is not None:
        return None
    total = float(order.total_amount)
    acknowledged = get_order_amount_acknowledged(db, order.id)
    outstanding = round(total - acknowledged, 2)
    if outstanding > _AMOUNT_TOLERANCE:
        return (
            f"{order.customer.name} has no credit facility -- {outstanding:.2f} of {total:.2f} is still "
            "unpaid (or paid but not yet acknowledged by Finance). Production cannot start until it's "
            "paid in full, or Finance records an override."
        )
    return None


def override_payment_gate(db: Session, order_id: int, reason: str, user_id: int | None = None) -> Order:
    """Finance's "otherwise take an override confirmation" branch: lets a
    non-credit order into production despite an acknowledged shortfall.
    Requires a reason on record, same as every other reasoned-override
    in this app (order.approved_at, production's overproduction_reason).
    A no-op call (nothing currently blocks this order) still records the
    override, harmlessly, rather than pretending nothing happened.
    """
    order = _get_order(db, order_id)
    if float(order.customer.credit_limit) > 0:
        raise ValidationAppError(
            f"{order.customer.name} has a credit facility -- there's no payment gate to override here."
        )
    assert_reason_given(reason, "A reason is required to override the payment gate.")
    order.payment_override_at = now_kuwait_naive()
    order.payment_override_by = user_id
    order.payment_override_reason = reason
    order.updated_by = user_id
    audit_service.log_update(
        db, "orders", order.id, {"payment_override_at": (None, order.payment_override_at)}, user_id
    )
    db.commit()
    db.refresh(order)
    return order


def set_payment_followup(
    db: Session, order_id: int, owner_id: int | None, followup_date: date | None, user_id: int | None = None
) -> Order:
    """Finance's own worklist entry for chasing this order's balance --
    both fields optional, and passing None for either clears it."""
    order = _get_order(db, order_id)
    order.payment_followup_owner_id = owner_id
    order.payment_followup_date = followup_date
    order.updated_by = user_id
    audit_service.log_update(
        db, "orders", order.id, {"payment_followup_date": (None, followup_date)}, user_id
    )
    db.commit()
    db.refresh(order)
    return order


def list_collection_queue(db: Session, user=None) -> list[dict]:
    """Every order with an overdue, still-outstanding balance -- the
    dedicated collection queue Finance works from. 'Overdue' is purely
    get_order_payment_status's own due-date math; a credit customer well
    within their limit can still show up here once their own payment
    terms have lapsed, same as a cash customer."""
    orders = (
        scope_by_customer(db.query(Order), Order.customer_id, user)
        .filter(Order.deleted_at.is_(None), Order.status.notin_(_BALANCE_EXCLUDED_STATUSES))
        .all()
    )
    as_of = now_kuwait_naive().date()
    queue = []
    for order in orders:
        status = get_order_payment_status(db, order, as_of=as_of)
        if status["overdue_days"] > 0:
            queue.append(
                {
                    **status,
                    "order_number": order.order_number,
                    "customer_id": order.customer_id,
                    "customer_name": order.customer.name,
                }
            )
    queue.sort(key=lambda row: row["overdue_days"], reverse=True)
    return queue


def create_payment(
    db: Session, order_id: int, data: dict, user_id: int | None = None, auto_acknowledge: bool = False
) -> Payment:
    order = _get_order(db, order_id)

    method = (data.get("method") or "").strip()
    reference = (data.get("reference") or "").strip()
    # A method left blank isn't an affirmative "cash" -- but it also isn't
    # a stated non-cash method either, so it's left alone here rather than
    # guessed at; only a method that's actually been entered as something
    # other than cash requires a reference.
    if method and method.lower() != _NO_REFERENCE_REQUIRED_METHOD:
        if not reference:
            raise ValidationAppError(
                "A payment reference is required for non-cash payment methods "
                "(bank ref / cheque number / transaction id)."
            )

    if reference:
        duplicate = (
            db.query(Payment)
            .filter(
                Payment.order_id == order_id,
                Payment.deleted_at.is_(None),
                func.lower(Payment.reference) == reference.lower(),
            )
            .first()
        )
        if duplicate is not None:
            raise ConflictError(
                f"A payment with reference '{reference}' is already recorded against this order."
            )

    payment = Payment(
        order_id=order.id,
        customer_id=order.customer_id,
        created_by=user_id,
        **data,
    )
    if auto_acknowledge:
        payment.acknowledged_at = now_kuwait_naive()
        payment.acknowledged_by = user_id
    db.add(payment)
    db.flush()
    audit_service.log_create(db, TABLE_NAME, payment.id, user_id)
    db.commit()
    db.refresh(payment)
    return get_payment(db, payment.id)


def acknowledge_payment(db: Session, order_id: int, payment_id: int, user_id: int | None = None) -> Payment:
    """Finance confirming a logged payment actually landed. Idempotent
    only in the sense of being safe to call again after a retry -- a
    second genuine acknowledgment attempt on an already-acknowledged
    payment is rejected, since there's nothing left to confirm."""
    payment = get_payment(db, payment_id)
    if payment.order_id != order_id:
        raise NotFoundError("Payment")
    if payment.acknowledged_at is not None:
        raise ConflictError("This payment has already been acknowledged.")
    payment.acknowledged_at = now_kuwait_naive()
    payment.acknowledged_by = user_id
    payment.updated_by = user_id
    audit_service.log_update(
        db, TABLE_NAME, payment.id, {"acknowledged_at": (None, payment.acknowledged_at)}, user_id
    )
    db.commit()
    db.refresh(payment)
    return get_payment(db, payment.id)


def delete_payment(db: Session, order_id: int, payment_id: int, user_id: int | None = None) -> None:
    """Reverses a wrongly-recorded payment. There's no edit -- correcting
    an amount/date/reference means deleting this and recording a fresh
    one, so the audit trail always shows what was actually entered and
    when, rather than a financial figure quietly changing after the
    fact."""
    payment = get_payment(db, payment_id)
    if payment.order_id != order_id:
        raise NotFoundError("Payment")
    payment.deleted_at = now_kuwait_naive()
    payment.updated_by = user_id
    audit_service.log_delete(db, TABLE_NAME, payment_id, user_id)
    db.commit()
