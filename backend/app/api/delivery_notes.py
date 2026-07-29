from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.api.common import PagedResponse
from app.api.deps import get_current_user, require_department_write
from app.core.database import get_db
from app.models.user import User
from app.schemas.delivery_note import (
    DeliveryNoteCreate,
    DeliveryNoteOut,
    DeliveryNoteStatusUpdate,
    DeliveryNoteUpdate,
)
from app.schemas.email import SendDocumentEmailRequest
from app.services import audit_service, delivery_note_service, email_service, pdf_generator

router = APIRouter(prefix="/api/delivery-notes", tags=["delivery-notes"])
write_guard = require_department_write("warehouse")


@router.get("", response_model=PagedResponse)
def list_delivery_notes(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=200),
    search: str | None = Query(None),
    status: str | None = Query(None),
    order_id: int | None = Query(None),
    sort: str | None = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = delivery_note_service.list_delivery_notes(
        db, page=page, page_size=page_size, search=search, status=status, order_id=order_id, sort=sort
    )
    result["items"] = [DeliveryNoteOut.from_model(n) for n in result["items"]]
    return result


@router.get("/{note_id}", response_model=DeliveryNoteOut)
def get_delivery_note(
    note_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return DeliveryNoteOut.from_model(delivery_note_service.get_delivery_note(db, note_id))


@router.get("/{note_id}/history")
def get_delivery_note_history(
    note_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    delivery_note_service.get_delivery_note(db, note_id, include_deleted=True)  # 404s if never existed
    return audit_service.get_history(db, "delivery_notes", note_id)


@router.post("", response_model=DeliveryNoteOut, status_code=201)
def create_delivery_note(
    payload: DeliveryNoteCreate,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    data = payload.model_dump()
    note = delivery_note_service.create_delivery_note(db, data, user_id=user.id)
    return DeliveryNoteOut.from_model(note)


@router.put("/{note_id}", response_model=DeliveryNoteOut)
def update_delivery_note(
    note_id: int,
    payload: DeliveryNoteUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    data = payload.model_dump(exclude_unset=True)
    note = delivery_note_service.update_delivery_note(db, note_id, data, user_id=user.id)
    return DeliveryNoteOut.from_model(note)


@router.post("/{note_id}/status", response_model=DeliveryNoteOut)
def update_status(
    note_id: int,
    payload: DeliveryNoteStatusUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    note = delivery_note_service.change_status(db, note_id, payload.status, user_id=user.id)
    return DeliveryNoteOut.from_model(note)


@router.delete("/{note_id}")
def delete_delivery_note(
    note_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    delivery_note_service.delete_delivery_note(db, note_id, user_id=user.id)
    return {"message": "Deleted."}


@router.post("/{note_id}/restore", response_model=DeliveryNoteOut)
def restore_delivery_note(
    note_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    note = delivery_note_service.restore_delivery_note(db, note_id, user_id=user.id)
    return DeliveryNoteOut.from_model(note)


@router.get("/{note_id}/pdf")
def download_delivery_note_pdf(
    note_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    note = delivery_note_service.get_delivery_note(db, note_id)
    company_settings = pdf_generator.get_company_settings(db)
    signer = pdf_generator.resolve_signer(db, note.created_by)
    pdf_bytes = pdf_generator.generate_delivery_note_pdf(note, company_settings, signer=signer)
    filename = f"{note.delivery_note_number}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/{note_id}/email")
def email_delivery_note_pdf(
    note_id: int,
    payload: SendDocumentEmailRequest,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    note = delivery_note_service.get_delivery_note(db, note_id)
    company_settings = pdf_generator.get_company_settings(db)
    signer = pdf_generator.resolve_signer(db, note.created_by)
    pdf_bytes = pdf_generator.generate_delivery_note_pdf(note, company_settings, signer=signer)
    filename = f"{note.delivery_note_number}.pdf"

    body = payload.message or (
        f"Please find attached delivery note {note.delivery_note_number}."
    )
    email_service.send_document_email(
        to_email=payload.to_email,
        subject=f"Delivery Note {note.delivery_note_number}",
        body=body,
        attachment_bytes=pdf_bytes,
        attachment_filename=filename,
    )
    audit_service.log_update(
        db, "delivery_notes", note_id, {"emailed_to": (None, payload.to_email)}, user.id
    )
    db.commit()
    return {"message": f"Emailed to {payload.to_email}."}
