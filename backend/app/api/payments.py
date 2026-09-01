from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import require_role
from app.core.database import get_db
from app.core.permissions import require_page_access
from app.models.user import User
from app.schemas.payment import PaymentCreate, PaymentOut
from app.services import payment_service

router = APIRouter(prefix="/api/orders/{order_id}/payments", tags=["payments"])
read_guard = require_page_access("orders", "read")
write_guard = require_page_access("orders", "write")
# Reversing a recorded payment stays admin-only regardless of anyone's
# "orders" write permission -- deleting a financial entry (even a
# wrongly-entered one) is more sensitive than the usual draft-record
# cleanup that permission otherwise covers.
admin_guard = require_role("admin")


@router.get("", response_model=list[PaymentOut])
def list_payments(
    order_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(read_guard),
):
    payments = payment_service.list_payments_for_order(db, order_id)
    return [PaymentOut.from_model(p) for p in payments]


@router.post("", response_model=PaymentOut, status_code=201)
def create_payment(
    order_id: int,
    payload: PaymentCreate,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    payment = payment_service.create_payment(db, order_id, payload.model_dump(), user_id=user.id)
    return PaymentOut.from_model(payment)


@router.delete("/{payment_id}")
def delete_payment(
    order_id: int,
    payment_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(admin_guard),
):
    payment_service.delete_payment(db, order_id, payment_id, user_id=user.id)
    return {"message": "Deleted."}
