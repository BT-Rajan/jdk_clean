from fastapi import Depends, File, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.common import build_crud_router
from app.core.database import get_db
from app.core.exceptions import NotFoundError
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
from app.services import customer_service, id_document_service, payment_service

read_guard = require_page_access("customers", "read")
write_guard = require_page_access("customers", "write")

ID_DOCUMENT_SUBDIR = "customer_ids"
TABLE_NAME = "customers"

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


@router.post("/{customer_id}/id-document", response_model=CustomerOut)
async def upload_customer_id_document(
    customer_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    customer = customer_crud.read_one(db, customer_id)
    raw_bytes = await file.read()
    return id_document_service.save_document(
        db, customer, raw_bytes, subdir=ID_DOCUMENT_SUBDIR, table_name=TABLE_NAME, user_id=user.id
    )


@router.delete("/{customer_id}/id-document", response_model=CustomerOut)
def delete_customer_id_document(
    customer_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    customer = customer_crud.read_one(db, customer_id)
    return id_document_service.delete_document(
        db, customer, subdir=ID_DOCUMENT_SUBDIR, table_name=TABLE_NAME, user_id=user.id
    )


@router.get("/{customer_id}/id-document")
def get_customer_id_document(
    customer_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(read_guard),
):
    customer = customer_crud.read_one(db, customer_id)
    found = id_document_service.get_document_file(customer, subdir=ID_DOCUMENT_SUBDIR)
    if found is None:
        raise NotFoundError("Id document")
    path, media_type = found
    return FileResponse(path, media_type=media_type)


@router.post("/{customer_id}/verify-id", response_model=CustomerOut)
def verify_customer_id(
    customer_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    """Also auto-advances onboarding_status where that's a legal single
    step -- see customer_service.verify_id."""
    return customer_service.verify_id(db, customer_id, user.id)


@router.post("/{customer_id}/unverify-id", response_model=CustomerOut)
def unverify_customer_id(
    customer_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    customer = customer_crud.read_one(db, customer_id)
    return id_document_service.unverify(db, customer, table_name=TABLE_NAME, user_id=user.id)
