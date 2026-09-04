from datetime import datetime, timezone

from sqlalchemy.orm import Session, joinedload

from app.core.exceptions import NotFoundError, ValidationAppError
from app.models.order import Order
from app.models.payment_plan import PaymentPlan
from app.services import audit_service

TABLE_NAME = "payment_plans"


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
    plan.deleted_at = datetime.now(timezone.utc)
    plan.updated_by = user_id
    audit_service.log_delete(db, TABLE_NAME, payment_plan_id, user_id)
    db.commit()
