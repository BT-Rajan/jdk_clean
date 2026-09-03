from sqlalchemy.orm import Session

from app.core.workflow import assert_reason_given, assert_transition_allowed
from app.crud.master_data import customer_crud
from app.models.customer import (
    ONBOARDING_ALLOWED_TRANSITIONS,
    ONBOARDING_STATUSES_REQUIRING_REASON,
    Customer,
)
from app.services import audit_service

TABLE_NAME = "customers"


def change_onboarding_status(
    db: Session,
    customer_id: int,
    new_status: str,
    reason: str | None,
    user_id: int | None,
) -> Customer:
    customer = customer_crud.read_one(db, customer_id)
    assert_transition_allowed(
        ONBOARDING_ALLOWED_TRANSITIONS, customer.onboarding_status, new_status, "customer onboarding"
    )
    if new_status in ONBOARDING_STATUSES_REQUIRING_REASON:
        assert_reason_given(reason, f"A reason is required to move onboarding to '{new_status}'.")

    old_status = customer.onboarding_status
    customer.onboarding_status = new_status
    customer.onboarding_reason = reason if new_status in ONBOARDING_STATUSES_REQUIRING_REASON else None
    customer.updated_by = user_id
    audit_service.log_update(
        db, TABLE_NAME, customer_id, {"onboarding_status": (old_status, new_status)}, user_id
    )
    db.commit()
    db.refresh(customer)
    return customer
