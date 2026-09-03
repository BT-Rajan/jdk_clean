from fastapi import Depends
from sqlalchemy.orm import Session

from app.api.common import build_crud_router
from app.core.database import get_db
from app.core.permissions import require_page_access
from app.crud.master_data import customer_crud
from app.models.user import User
from app.schemas.customer import (
    CustomerCreate,
    CustomerOnboardingStatusUpdate,
    CustomerOut,
    CustomerUpdate,
)
from app.schemas.payment import CustomerCreditStatusOut
from app.services import customer_service, payment_service

read_guard = require_page_access("customers", "read")
write_guard = require_page_access("customers", "write")

router = build_crud_router(
    crud=customer_crud,
    create_schema=CustomerCreate,
    update_schema=CustomerUpdate,
    out_schema=CustomerOut,
    prefix="/api/customers",
    tags=["customers"],
    page_key="customers",
)


@router.get("/{customer_id}/credit", response_model=CustomerCreditStatusOut)
def get_customer_credit(
    customer_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(read_guard),
):
    """Credit limit, current outstanding balance (unpaid non-draft/
    non-cancelled orders), and what's left before order_service.
    change_status starts refusing to confirm a new order for this
    customer without admin approval."""
    return payment_service.get_customer_credit_status(db, customer_id)


@router.post("/{customer_id}/onboarding-status", response_model=CustomerOut)
def update_customer_onboarding_status(
    customer_id: int,
    payload: CustomerOnboardingStatusUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    return customer_service.change_onboarding_status(
        db, customer_id, payload.status, payload.reason, user.id
    )
