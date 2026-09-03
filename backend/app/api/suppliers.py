from fastapi import Depends
from sqlalchemy.orm import Session

from app.api.common import build_crud_router
from app.core.database import get_db
from app.core.permissions import require_page_access
from app.crud.master_data import supplier_crud
from app.models.user import User
from app.schemas.supplier import (
    SupplierCreate,
    SupplierOnboardingStatusUpdate,
    SupplierOut,
    SupplierUpdate,
)
from app.services import supplier_service

write_guard = require_page_access("suppliers", "write")

router = build_crud_router(
    crud=supplier_crud,
    create_schema=SupplierCreate,
    update_schema=SupplierUpdate,
    out_schema=SupplierOut,
    prefix="/api/suppliers",
    tags=["suppliers"],
    page_key="suppliers",
)


@router.post("/{supplier_id}/onboarding-status", response_model=SupplierOut)
def update_supplier_onboarding_status(
    supplier_id: int,
    payload: SupplierOnboardingStatusUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    return supplier_service.change_onboarding_status(
        db, supplier_id, payload.status, payload.reason, user.id
    )
