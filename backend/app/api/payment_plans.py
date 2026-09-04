from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import require_role
from app.core.database import get_db
from app.core.permissions import require_page_access
from app.models.user import User
from app.schemas.payment_plan import PaymentPlanCreate, PaymentPlanOut
from app.services import payment_plan_service

router = APIRouter(prefix="/api/orders/{order_id}/payment-plans", tags=["payment-plans"])
read_guard = require_page_access("orders", "read")
write_guard = require_page_access("orders", "write")
# Same as payments.py: reversing a recorded plan stays admin-only
# regardless of "orders" write permission.
admin_guard = require_role("admin")


@router.get("", response_model=list[PaymentPlanOut])
def list_payment_plans(
    order_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(read_guard),
):
    plans = payment_plan_service.list_payment_plans_for_order(db, order_id)
    return [PaymentPlanOut.from_model(p) for p in plans]


@router.post("", response_model=PaymentPlanOut, status_code=201)
def create_payment_plan(
    order_id: int,
    payload: PaymentPlanCreate,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    plan = payment_plan_service.create_payment_plan(db, order_id, payload.model_dump(), user_id=user.id)
    return PaymentPlanOut.from_model(plan)


@router.delete("/{payment_plan_id}")
def delete_payment_plan(
    order_id: int,
    payment_plan_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(admin_guard),
):
    payment_plan_service.delete_payment_plan(db, order_id, payment_plan_id, user_id=user.id)
    return {"message": "Deleted."}
