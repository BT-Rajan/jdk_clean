from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.common import PagedResponse
from app.api.deps import require_role
from app.core.database import get_db
from app.core.permissions import require_page_access
from app.models.user import User
from app.schemas.feasibility import (
    FeasibilityAdminReview,
    FeasibilityClose,
    FeasibilityCreate,
    FeasibilityExceptionDecision,
    FeasibilityOut,
)
from app.services import audit_service, feasibility_service

router = APIRouter(prefix="/api/feasibility", tags=["feasibility"])
read_guard = require_page_access("feasibilities", "read")
write_guard = require_page_access("feasibilities", "write")
admin_guard = require_role("admin")


@router.get("", response_model=PagedResponse)
def list_feasibility_checks(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=200),
    search: str | None = Query(None),
    status: str | None = Query(None),
    customer_id: int | None = Query(None),
    sort: str | None = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(read_guard),
):
    result = feasibility_service.list_feasibility_checks(
        db, page=page, page_size=page_size, search=search, status=status, customer_id=customer_id, sort=sort
    )
    result["items"] = [FeasibilityOut.from_model(f) for f in result["items"]]
    return result


@router.get("/available/for-quotation", response_model=list[FeasibilityOut])
def list_available_for_quotation(
    customer_id: int | None = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(read_guard),
):
    """List feasibility checks available for quotation generation.
    Only returns checks in quotable statuses that haven't been converted or closed."""
    feasibilities = feasibility_service.list_available_for_quotation(db, customer_id=customer_id)
    return [FeasibilityOut.from_model(f) for f in feasibilities]


@router.get("/{feasibility_id}", response_model=FeasibilityOut)
def get_feasibility(
    feasibility_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(read_guard),
):
    return FeasibilityOut.from_model(feasibility_service.get_feasibility(db, feasibility_id))


@router.get("/{feasibility_id}/history")
def get_feasibility_history(
    feasibility_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(read_guard),
):
    feasibility_service.get_feasibility(db, feasibility_id, include_deleted=True)  # 404s if never existed
    return audit_service.get_history(db, "feasibility_checks", feasibility_id)


@router.post("", response_model=FeasibilityOut, status_code=201)
def create_feasibility(
    payload: FeasibilityCreate,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    data = payload.model_dump()
    feasibility = feasibility_service.create_feasibility(db, data, user_id=user.id)
    return FeasibilityOut.from_model(feasibility)


@router.post("/{feasibility_id}/run", response_model=FeasibilityOut)
def run_feasibility_check(
    feasibility_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    """Tries to manufacture every line from raw materials currently in
    inventory. Comes back 'feasible' or 'exception_pending' (needing
    Sales' exception approval before this can become a quotation)."""
    feasibility = feasibility_service.run_check(db, feasibility_id, user_id=user.id)
    return FeasibilityOut.from_model(feasibility)


@router.post("/{feasibility_id}/exception", response_model=FeasibilityOut)
def decide_feasibility_exception(
    feasibility_id: int,
    payload: FeasibilityExceptionDecision,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    feasibility = feasibility_service.decide_exception(
        db, feasibility_id, payload.approve, payload.reason, user_id=user.id
    )
    return FeasibilityOut.from_model(feasibility)


@router.post("/{feasibility_id}/close", response_model=FeasibilityOut)
def close_feasibility(
    feasibility_id: int,
    payload: FeasibilityClose,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    feasibility = feasibility_service.close_feasibility(
        db, feasibility_id, payload.reason, user_id=user.id
    )
    return FeasibilityOut.from_model(feasibility)


@router.post("/{feasibility_id}/revive", response_model=FeasibilityOut)
def revive_feasibility(
    feasibility_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    """Sales reviving a converted/closed/rejected check to run and quote
    from it again, any number of times -- see feasibility_service.
    revive_feasibility for what resets."""
    feasibility = feasibility_service.revive_feasibility(db, feasibility_id, user_id=user.id)
    return FeasibilityOut.from_model(feasibility)


@router.post("/scan-stale")
def scan_stale_feasibility_checks(
    db: Session = Depends(get_db),
    user: User = Depends(admin_guard),
):
    """Flags feasibility checks open more than 5 days with neither a
    quotation conversion nor a close reason, for admin attention. Run this
    periodically (e.g. an external cron/scheduled task hitting this
    endpoint daily)."""
    flagged = feasibility_service.escalate_stale_feasibility_checks(db)
    return {
        "flagged_count": len(flagged),
        "feasibility_ids": [f.id for f in flagged],
    }


@router.post("/{feasibility_id}/admin-review", response_model=FeasibilityOut)
def admin_review_feasibility(
    feasibility_id: int,
    payload: FeasibilityAdminReview,
    db: Session = Depends(get_db),
    user: User = Depends(admin_guard),
):
    feasibility = feasibility_service.admin_review(db, feasibility_id, payload.notes, user_id=user.id)
    return FeasibilityOut.from_model(feasibility)


@router.delete("/{feasibility_id}")
def delete_feasibility(
    feasibility_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    feasibility_service.delete_feasibility(db, feasibility_id, user_id=user.id)
    return {"message": "Deleted."}


@router.post("/{feasibility_id}/restore", response_model=FeasibilityOut)
def restore_feasibility(
    feasibility_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    feasibility = feasibility_service.restore_feasibility(db, feasibility_id, user_id=user.id)
    return FeasibilityOut.from_model(feasibility)
