from datetime import datetime, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.core.exceptions import NotFoundError, ValidationAppError
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


def create_payment(db: Session, order_id: int, data: dict, user_id: int | None = None) -> Payment:
    order = _get_order(db, order_id)
    payment = Payment(
        order_id=order.id,
        customer_id=order.customer_id,
        created_by=user_id,
        **data,
    )
    db.add(payment)
    db.flush()
    audit_service.log_create(db, TABLE_NAME, payment.id, user_id)
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
    payment.deleted_at = datetime.now(timezone.utc)
    payment.updated_by = user_id
    audit_service.log_delete(db, TABLE_NAME, payment_id, user_id)
    db.commit()
