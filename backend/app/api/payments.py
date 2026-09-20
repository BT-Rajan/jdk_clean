from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_role
from app.core.database import get_db
from app.core.exceptions import PermissionError_
from app.core.permissions import has_page_access, require_page_access
from app.models.user import User
from app.schemas.order import OrderOut
from app.schemas.payment import (
    OrderPaymentStatusOut,
    PaymentCreate,
    PaymentFollowupIn,
    PaymentOut,
    PaymentOverrideIn,
)
from app.services import order_service, payment_service

router = APIRouter(prefix="/api/orders/{order_id}/payments", tags=["payments"])
read_guard = require_page_access("orders", "read")
# Finance's own guard -- acknowledging a payment, overriding the
# production gate, and setting a follow-up owner/date are Finance's job,
# distinct from Sales logging a payment claim via "orders" write. See
# core/permissions.py's PAGE_KEYS comment.
finance_guard = require_page_access("payments", "write")
# Reversing a recorded payment stays admin-only regardless of anyone's
# "orders" write permission -- deleting a financial entry (even a
# wrongly-entered one) is more sensitive than the usual draft-record
# cleanup that permission otherwise covers.
admin_guard = require_role("admin")


def create_payment_guard(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> User:
    """Either Sales logging a claim ("orders" write) or Finance logging an
    already-confirmed payment ("payments" write) may create one -- see
    create_payment below for how the two differ (auto-acknowledged or
    not)."""
    if has_page_access(user, db, "orders", "write") or has_page_access(user, db, "payments", "write"):
        return user
    raise PermissionError_()


@router.get("", response_model=list[PaymentOut])
def list_payments(
    order_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(read_guard),
):
    payments = payment_service.list_payments_for_order(db, order_id)
    return [PaymentOut.from_model(p) for p in payments]


@router.get("/status", response_model=OrderPaymentStatusOut)
def get_payment_status(
    order_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(read_guard),
):
    order = order_service.get_order(db, order_id)
    return payment_service.get_order_payment_status(db, order)


@router.post("", response_model=PaymentOut, status_code=201)
def create_payment(
    order_id: int,
    payload: PaymentCreate,
    db: Session = Depends(get_db),
    user: User = Depends(create_payment_guard),
):
    # A payment logged by someone who already holds "payments" write
    # (Finance) is Finance itself confirming the amount it received --
    # there's no second person left to acknowledge it with, so it's
    # acknowledged the moment it's entered. A payment logged by Sales
    # ("orders" write only) is just a claim until Finance acknowledges it
    # via POST .../{payment_id}/acknowledge.
    auto_acknowledge = has_page_access(user, db, "payments", "write")
    payment = payment_service.create_payment(
        db, order_id, payload.model_dump(), user_id=user.id, auto_acknowledge=auto_acknowledge
    )
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


@router.post("/{payment_id}/acknowledge", response_model=PaymentOut)
def acknowledge_payment(
    order_id: int,
    payment_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(finance_guard),
):
    payment = payment_service.acknowledge_payment(db, order_id, payment_id, user_id=user.id)
    return PaymentOut.from_model(payment)


@router.post("/override", response_model=OrderOut)
def override_payment_gate(
    order_id: int,
    payload: PaymentOverrideIn,
    db: Session = Depends(get_db),
    user: User = Depends(finance_guard),
):
    order = payment_service.override_payment_gate(db, order_id, payload.reason, user_id=user.id)
    return OrderOut.from_model(order)


@router.post("/followup", response_model=OrderOut)
def set_payment_followup(
    order_id: int,
    payload: PaymentFollowupIn,
    db: Session = Depends(get_db),
    user: User = Depends(finance_guard),
):
    order = payment_service.set_payment_followup(
        db, order_id, payload.owner_id, payload.followup_date, user_id=user.id
    )
    return OrderOut.from_model(order)
