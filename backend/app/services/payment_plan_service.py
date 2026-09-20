from sqlalchemy.orm import Session, joinedload

from app.core.exceptions import ConflictError, NotFoundError, ValidationAppError
from app.core.timezone import now_kuwait_naive
from app.models.order import Order
from app.models.payment_plan import PaymentPlan
from app.services import audit_service, payment_service

TABLE_NAME = "payment_plans"

# Same rounding tolerance payment_service uses when comparing an amount
# against a total.
_AMOUNT_TOLERANCE = 0.01


def _base_query(db: Session, include_deleted: bool = False):
    query = db.query(PaymentPlan).options(
        joinedload(PaymentPlan.order),
        joinedload(PaymentPlan.customer),
        joinedload(PaymentPlan.creator),
    )
    if not include_deleted:
        query = query.filter(PaymentPlan.deleted_at.is_(None))
    return query


def get_payment_plan(db: Session, payment_plan_id: int, include_deleted: bool = False) -> PaymentPlan:
    obj = _base_query(db, include_deleted).filter(PaymentPlan.id == payment_plan_id).first()
    if obj is None:
        raise NotFoundError("Payment plan")
    return obj


def _get_order(db: Session, order_id: int) -> Order:
    order = db.query(Order).filter(Order.id == order_id, Order.deleted_at.is_(None)).first()
    if order is None:
        raise ValidationAppError(f"Order {order_id} not found.")
    return order


def list_payment_plans_for_order(db: Session, order_id: int) -> list[PaymentPlan]:
    _get_order(db, order_id)
    return (
        _base_query(db)
        .filter(PaymentPlan.order_id == order_id)
        .order_by(PaymentPlan.target_date.asc(), PaymentPlan.id.desc())
        .all()
    )


def create_payment_plan(db: Session, order_id: int, data: dict, user_id: int | None = None) -> PaymentPlan:
    order = _get_order(db, order_id)
    plan = PaymentPlan(
        order_id=order.id,
        customer_id=order.customer_id,
        created_by=user_id,
        **data,
    )
    db.add(plan)
    db.flush()
    audit_service.log_create(db, TABLE_NAME, plan.id, user_id)
    db.commit()
    db.refresh(plan)
    return get_payment_plan(db, plan.id)


def delete_payment_plan(db: Session, order_id: int, payment_plan_id: int, user_id: int | None = None) -> None:
    """Reverses a wrongly-recorded plan. Same no-edit, delete-and-recreate
    stance as payment_service.delete_payment."""
    plan = get_payment_plan(db, payment_plan_id)
    if plan.order_id != order_id:
        raise NotFoundError("Payment plan")
    plan.deleted_at = now_kuwait_naive()
    plan.updated_by = user_id
    audit_service.log_delete(db, TABLE_NAME, payment_plan_id, user_id)
    db.commit()


def complete_payment_plan(db: Session, order_id: int, payment_plan_id: int, user_id: int | None = None) -> PaymentPlan:
    """Marks a plan settled -- refused while its order still has an
    outstanding acknowledged balance (payment_service.
    get_order_amount_acknowledged), so a plan can't be closed out just
    because its target date arrived if the money never actually landed
    and was confirmed. Measured against the order's balance as a whole,
    not this plan's own amount -- a plan is a commitment on the order,
    not a ring-fenced sub-total distinct from any other payment against
    it.
    """
    plan = get_payment_plan(db, payment_plan_id)
    if plan.order_id != order_id:
        raise NotFoundError("Payment plan")
    if plan.status == "completed":
        raise ConflictError("This payment plan has already been completed.")

    outstanding = round(
        float(plan.order.total_amount) - payment_service.get_order_amount_acknowledged(db, order_id), 2
    )
    if outstanding > _AMOUNT_TOLERANCE:
        raise ConflictError(
            f"Cannot complete this payment plan: {outstanding:.2f} is still outstanding and "
            "unacknowledged on the order."
        )

    plan.status = "completed"
    plan.completed_at = now_kuwait_naive()
    plan.completed_by = user_id
    plan.updated_by = user_id
    audit_service.log_update(
        db, TABLE_NAME, plan.id, {"status": ("open", "completed")}, user_id
    )
    db.commit()
    db.refresh(plan)
    return get_payment_plan(db, plan.id)
