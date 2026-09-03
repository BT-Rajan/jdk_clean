from sqlalchemy.orm import Session

from app.core.workflow import assert_reason_given, assert_transition_allowed
from app.crud.master_data import supplier_crud
from app.models.supplier import (
    ONBOARDING_ALLOWED_TRANSITIONS,
    ONBOARDING_STATUSES_REQUIRING_REASON,
    Supplier,
)
from app.services import audit_service

TABLE_NAME = "suppliers"


def change_onboarding_status(
    db: Session,
    supplier_id: int,
    new_status: str,
    reason: str | None,
    user_id: int | None,
) -> Supplier:
    supplier = supplier_crud.read_one(db, supplier_id)
    assert_transition_allowed(
        ONBOARDING_ALLOWED_TRANSITIONS, supplier.onboarding_status, new_status, "supplier onboarding"
    )
    if new_status in ONBOARDING_STATUSES_REQUIRING_REASON:
        assert_reason_given(reason, f"A reason is required to move onboarding to '{new_status}'.")

    old_status = supplier.onboarding_status
    supplier.onboarding_status = new_status
    supplier.onboarding_reason = reason if new_status in ONBOARDING_STATUSES_REQUIRING_REASON else None
    supplier.updated_by = user_id
    audit_service.log_update(
        db, TABLE_NAME, supplier_id, {"onboarding_status": (old_status, new_status)}, user_id
    )
    db.commit()
    db.refresh(supplier)
    return supplier
