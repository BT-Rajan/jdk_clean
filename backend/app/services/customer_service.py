from sqlalchemy.orm import Session

from app.core.workflow import assert_reason_given, assert_transition_allowed
from app.crud.master_data import customer_crud
from app.models.customer import (
    ONBOARDING_ALLOWED_TRANSITIONS,
    ONBOARDING_STATUSES_REQUIRING_REASON,
    Customer,
)
from app.services import audit_service, id_document_service

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


def _auto_advance_onboarding_after_id_verified(db: Session, customer: Customer, user_id: int | None) -> None:
    """Verifying the id document is treated as completing whatever the
    onboarding workflow was waiting on: if 'active' is a reachable
    single step from the customer's current onboarding_status, jump
    straight there (from 'under_review' or 'on_hold'); otherwise, if
    'under_review' is reachable, move there instead (from 'pending' --
    this deliberately doesn't skip the review step entirely just
    because the id document showed up). From 'active' or 'rejected',
    neither target is a legal single step (see ONBOARDING_ALLOWED_
    TRANSITIONS) so this is a no-op -- a rejected customer needs an
    explicit admin decision to move again, not to be silently reopened
    by an unrelated id upload.

    One-way: unverifying an id (id_document_service.unverify) never
    reverses this -- onboarding_status is left wherever it's gotten to,
    since a later paperwork correction shouldn't regress a customer
    who's since progressed through other, unrelated review steps.
    """
    allowed = ONBOARDING_ALLOWED_TRANSITIONS.get(customer.onboarding_status, set())
    target = "active" if "active" in allowed else "under_review" if "under_review" in allowed else None
    if target:
        change_onboarding_status(db, customer.id, target, reason=None, user_id=user_id)


def verify_id(db: Session, customer_id: int, user_id: int | None) -> Customer:
    customer = customer_crud.read_one(db, customer_id)
    customer = id_document_service.verify(db, customer, table_name=TABLE_NAME, user_id=user_id)
    _auto_advance_onboarding_after_id_verified(db, customer, user_id)
    db.refresh(customer)
    return customer
