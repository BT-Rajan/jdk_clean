from typing import Literal

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.api.sales_scope_guard import sales_record_scope_guard
from app.core.sales_scope import assert_customer_in_scope
from app.api.common import PagedResponse
from app.core.database import get_db
from app.core.permissions import require_page_access
from app.models.user import User
from app.schemas.delivery_note import (
    DeliveryNoteCreate,
    DeliveryNoteOut,
    DeliveryNoteStatusUpdate,
    DeliveryNoteUpdate,
)
from app.schemas.email import SendDocumentEmailRequest
from app.services import (
    audit_service,
    delivery_note_service,
    doc_converter,
    doc_template_service,
    email_service,
    email_template_service,
    order_service,
    pdf_generator,
)

router = APIRouter(prefix="/api/delivery-notes", tags=["delivery-notes"], dependencies=[Depends(sales_record_scope_guard)])
read_guard = require_page_access("delivery_notes", "read")
write_guard = require_page_access("delivery_notes", "write")


def _assert_order_in_scope(db: Session, user: User, order_id: int) -> None:
    """A delivery note may only be raised against an order whose customer is
    the salesman's own (the body names the order, so the path-param guard
    can't see it)."""
    from app.core.sales_scope import customer_of_order

    customer_id = customer_of_order(db, order_id)
    if customer_id is not None:
        assert_customer_in_scope(db, user, customer_id, "Order")


def _with_fulfillment(db: Session, note) -> DeliveryNoteOut:
    """P9 section 18: the detail view's fulfilment context (Ordered/
    Previously Delivered/Remaining/Available Released FG/Deliverable
    Now), reusing order_service.get_fulfillment -- never a second
    calculation. Skipped by list_delivery_notes (a list row doesn't need
    this much detail, and it would mean one get_fulfillment call per row)."""
    fulfillment_by_product = {line["product_id"]: line for line in order_service.get_fulfillment(db, note.order_id)}
    return DeliveryNoteOut.from_model(note, fulfillment_by_product)


@router.get("", response_model=PagedResponse)
def list_delivery_notes(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=200),
    search: str | None = Query(None),
    status: str | None = Query(None),
    order_id: int | None = Query(None),
    sort: str | None = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(read_guard),
):
    result = delivery_note_service.list_delivery_notes(
        db, page=page, page_size=page_size, search=search, status=status, order_id=order_id, sort=sort, user=user
    )
    result["items"] = [DeliveryNoteOut.from_model(n) for n in result["items"]]
    return result


@router.get("/{note_id}", response_model=DeliveryNoteOut)
def get_delivery_note(
    note_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(read_guard),
):
    return _with_fulfillment(db, delivery_note_service.get_delivery_note(db, note_id))


@router.get("/{note_id}/history")
def get_delivery_note_history(
    note_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(read_guard),
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
    _assert_order_in_scope(db, user, data["order_id"])
    note = delivery_note_service.create_delivery_note(db, data, user_id=user.id)
    return _with_fulfillment(db, note)


@router.put("/{note_id}", response_model=DeliveryNoteOut)
def update_delivery_note(
    note_id: int,
    payload: DeliveryNoteUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    data = payload.model_dump(exclude_unset=True)
    note = delivery_note_service.update_delivery_note(db, note_id, data, user_id=user.id)
    return _with_fulfillment(db, note)


@router.post("/{note_id}/status", response_model=DeliveryNoteOut)
def update_status(
    note_id: int,
    payload: DeliveryNoteStatusUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    note = delivery_note_service.change_status(db, note_id, payload.status, reason=payload.reason, user_id=user.id)
    return _with_fulfillment(db, note)


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
    return _with_fulfillment(db, note)


def _render_delivery_note_pdf(db: Session, note, language: str) -> bytes:
    """Renders the admin template active for (delivery_note, language)
    through LibreOffice, so Print and Email use the same document Admin
    -> Documents controls -- see the identical helper in api/quotations.py."""
    context = doc_template_service.build_delivery_note_context(db, note)
    docx_bytes = doc_template_service.render_document(db, "delivery_note", language, context)
    return doc_converter.convert_docx_to_pdf(docx_bytes)


@router.get("/{note_id}/pdf")
def download_delivery_note_pdf(
    note_id: int,
    language: Literal["en", "ar"] = Query("en"),
    db: Session = Depends(get_db),
    _: User = Depends(read_guard),
):
    note = delivery_note_service.get_delivery_note(db, note_id)
    pdf_bytes = _render_delivery_note_pdf(db, note, language)
    filename = f"{note.delivery_note_number}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{note_id}/docx")
def download_delivery_note_docx(
    note_id: int,
    language: Literal["en", "ar"] = Query("en"),
    db: Session = Depends(get_db),
    _: User = Depends(read_guard),
):
    note = delivery_note_service.get_delivery_note(db, note_id)
    context = doc_template_service.build_delivery_note_context(db, note)
    docx_bytes = doc_template_service.render_document(db, "delivery_note", language, context)
    filename = f"{note.delivery_note_number}_{language}.docx"
    return Response(
        content=docx_bytes,
        media_type=doc_template_service.DOCX_MEDIA_TYPE,
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
    pdf_bytes = _render_delivery_note_pdf(db, note, "en")
    filename = f"{note.delivery_note_number}.pdf"

    company_settings = pdf_generator.get_company_settings(db)
    subject, template_body = email_template_service.render(
        db,
        "delivery_note_email",
        {
            "customer_name": note.order.customer.name if note.order and note.order.customer else "",
            "delivery_note_number": note.delivery_note_number,
            "order_number": note.order.order_number if note.order else "",
            "delivery_date": note.delivery_date.isoformat(),
            "company_name": company_settings.get("company_name", ""),
        },
    )
    body = payload.message or template_body

    email_service.send_document_email(
        db=db,
        to_email=payload.to_email,
        subject=subject,
        body=body,
        attachment_bytes=pdf_bytes if payload.attach_pdf else None,
        attachment_filename=filename if payload.attach_pdf else None,
    )
    audit_service.log_update(
        db, "delivery_notes", note_id, {"emailed_to": (None, payload.to_email)}, user.id
    )
    db.commit()
    return {"message": f"Emailed to {payload.to_email}."}
