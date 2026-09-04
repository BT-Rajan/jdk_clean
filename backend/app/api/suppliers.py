from fastapi import Depends, File, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.common import build_crud_router
from app.core.database import get_db
from app.core.exceptions import NotFoundError
from app.core.permissions import require_page_access
from app.crud.master_data import supplier_crud
from app.models.user import User
from app.schemas.supplier import (
    SupplierCreate,
    SupplierOnboardingStatusUpdate,
    SupplierOut,
    SupplierUpdate,
)
from app.services import id_document_service, supplier_service

read_guard = require_page_access("suppliers", "read")
write_guard = require_page_access("suppliers", "write")

ID_DOCUMENT_SUBDIR = "supplier_ids"
TABLE_NAME = "suppliers"

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


@router.post("/{supplier_id}/id-document", response_model=SupplierOut)
async def upload_supplier_id_document(
    supplier_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    supplier = supplier_crud.read_one(db, supplier_id)
    raw_bytes = await file.read()
    return id_document_service.save_document(
        db, supplier, raw_bytes, subdir=ID_DOCUMENT_SUBDIR, table_name=TABLE_NAME, user_id=user.id
    )


@router.delete("/{supplier_id}/id-document", response_model=SupplierOut)
def delete_supplier_id_document(
    supplier_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    supplier = supplier_crud.read_one(db, supplier_id)
    return id_document_service.delete_document(
        db, supplier, subdir=ID_DOCUMENT_SUBDIR, table_name=TABLE_NAME, user_id=user.id
    )


@router.get("/{supplier_id}/id-document")
def get_supplier_id_document(
    supplier_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(read_guard),
):
    supplier = supplier_crud.read_one(db, supplier_id)
    found = id_document_service.get_document_file(supplier, subdir=ID_DOCUMENT_SUBDIR)
    if found is None:
        raise NotFoundError("Id document")
    path, media_type = found
    return FileResponse(path, media_type=media_type)


@router.post("/{supplier_id}/verify-id", response_model=SupplierOut)
def verify_supplier_id(
    supplier_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    """Also auto-advances onboarding_status where that's a legal single
    step -- see supplier_service.verify_id."""
    return supplier_service.verify_id(db, supplier_id, user.id)


@router.post("/{supplier_id}/unverify-id", response_model=SupplierOut)
def unverify_supplier_id(
    supplier_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    supplier = supplier_crud.read_one(db, supplier_id)
    return id_document_service.unverify(db, supplier, table_name=TABLE_NAME, user_id=user.id)
