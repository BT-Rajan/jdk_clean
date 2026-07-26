from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.api.common import PagedResponse
from app.api.deps import get_current_user, require_role
from app.core.database import get_db
from app.models.user import User
from app.schemas.quotation import (
    QuotationCreate,
    QuotationOut,
    QuotationStatusUpdate,
    QuotationUpdate,
)
from app.services import audit_service, pdf_generator, quotation_service

router = APIRouter(prefix="/api/quotations", tags=["quotations"])
write_guard = require_role("admin", "manager")


@router.get("", response_model=PagedResponse)
def list_quotations(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=200),
    search: str | None = Query(None),
    status: str | None = Query(None),
    customer_id: int | None = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = quotation_service.list_quotations(
        db, page=page, page_size=page_size, search=search, status=status, customer_id=customer_id
    )
    result["items"] = [QuotationOut.from_model(q) for q in result["items"]]
    return result


@router.get("/{quotation_id}", response_model=QuotationOut)
def get_quotation(
    quotation_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return QuotationOut.from_model(quotation_service.get_quotation(db, quotation_id))


@router.get("/{quotation_id}/history")
def get_quotation_history(
    quotation_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    quotation_service.get_quotation(db, quotation_id, include_deleted=True)  # 404s if never existed
    return audit_service.get_history(db, "quotations", quotation_id)


@router.post("", response_model=QuotationOut, status_code=201)
def create_quotation(
    payload: QuotationCreate,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    data = payload.model_dump()
    quotation = quotation_service.create_quotation(db, data, user_id=user.id)
    return QuotationOut.from_model(quotation)


@router.put("/{quotation_id}", response_model=QuotationOut)
def update_quotation(
    quotation_id: int,
    payload: QuotationUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    data = payload.model_dump(exclude_unset=True)
    quotation = quotation_service.update_quotation(db, quotation_id, data, user_id=user.id)
    return QuotationOut.from_model(quotation)


@router.post("/{quotation_id}/status", response_model=QuotationOut)
def update_status(
    quotation_id: int,
    payload: QuotationStatusUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    quotation = quotation_service.change_status(db, quotation_id, payload.status, user_id=user.id)
    return QuotationOut.from_model(quotation)


@router.delete("/{quotation_id}")
def delete_quotation(
    quotation_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    quotation_service.delete_quotation(db, quotation_id, user_id=user.id)
    return {"message": "Deleted."}


@router.post("/{quotation_id}/restore", response_model=QuotationOut)
def restore_quotation(
    quotation_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    quotation = quotation_service.restore_quotation(db, quotation_id, user_id=user.id)
    return QuotationOut.from_model(quotation)


@router.get("/{quotation_id}/pdf")
def download_quotation_pdf(
    quotation_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    quotation = quotation_service.get_quotation(db, quotation_id)
    company_settings = pdf_generator.get_company_settings(db)
    pdf_bytes = pdf_generator.generate_quotation_pdf(quotation, company_settings)
    filename = f"{quotation.quotation_number}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
