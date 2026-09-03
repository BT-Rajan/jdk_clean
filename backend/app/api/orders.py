from datetime import timezone
from typing import Literal

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.api.common import PagedResponse
from app.api.deps import require_role
from app.core.database import get_db
from app.core.permissions import require_page_access
from app.core.timezone import KUWAIT_TZ, today_kuwait
from app.models.user import User
from app.schemas.email import SendDocumentEmailRequest
from app.schemas.order import (
    OrderAdminReview,
    OrderCreate,
    OrderOut,
    OrderQuickLog,
    OrderStatusUpdate,
    OrderUpdate,
    SplitOrderRequest,
)
from app.schemas.order_journey import OrderJourneyOut
from app.services import (
    audit_service,
    doc_template_service,
    email_service,
    email_template_service,
    order_journey_service,
    order_service,
    payment_service,
    pdf_generator,
)

router = APIRouter(prefix="/api/orders", tags=["orders"])
read_guard = require_page_access("orders", "read")
write_guard = require_page_access("orders", "write")
admin_guard = require_role("admin")


@router.get("", response_model=PagedResponse)
def list_orders(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=200),
    search: str | None = Query(None),
    status: str | None = Query(None),
    customer_id: int | None = Query(None),
    admin_review_required: bool | None = Query(None),
    sort: str | None = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(read_guard),
):
    result = order_service.list_orders(
        db,
        page=page,
        page_size=page_size,
        search=search,
        status=status,
        customer_id=customer_id,
        admin_review_required=admin_review_required,
        sort=sort,
    )
    result["items"] = [OrderOut.from_model(o) for o in result["items"]]
    return result


@router.get("/{order_id}", response_model=OrderOut)
def get_order(
    order_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(read_guard),
):
    return OrderOut.from_model(order_service.get_order(db, order_id))


@router.get("/{order_id}/journey", response_model=OrderJourneyOut)
def get_order_journey(
    order_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(read_guard),
):
    """The single-page answer to 'where is this order right now' -- the
    feasibility check it came from, the quotation it was raised on, the
    order itself, every production batch scheduled against it, and every
    delivery note issued for it. All read live off the existing foreign
    keys between those five tables; nothing new is stored."""
    return order_journey_service.get_order_journey(db, order_id)


@router.get("/{order_id}/history")
def get_order_history(
    order_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(read_guard),
):
    order_service.get_order(db, order_id, include_deleted=True)  # 404s if never existed
    return audit_service.get_history(db, "orders", order_id)


@router.post("", response_model=OrderOut, status_code=201)
def create_order(
    payload: OrderCreate,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    data = payload.model_dump()
    order = order_service.create_order(db, data, user_id=user.id)
    return OrderOut.from_model(order)


@router.post("/log", response_model=OrderOut, status_code=201)
def log_sale(
    payload: OrderQuickLog,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    """One-click entry for a sale that's already happened -- creates an
    order, confirms it, and issues a delivery note for it in a single
    call instead of working through 3 separate screens. See
    order_service.log_sale."""
    order = order_service.log_sale(
        db,
        payload.customer_id,
        [line.model_dump() for line in payload.lines],
        notes=payload.notes,
        entry_date=payload.entry_date,
        user_id=user.id,
    )
    return OrderOut.from_model(order)


@router.post("/from-quotation/{quotation_id}", response_model=OrderOut, status_code=201)
def create_order_from_quotation(
    quotation_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    order = order_service.create_order_from_quotation(db, quotation_id, user_id=user.id)
    return OrderOut.from_model(order)


@router.put("/{order_id}", response_model=OrderOut)
def update_order(
    order_id: int,
    payload: OrderUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    data = payload.model_dump(exclude_unset=True)
    order = order_service.update_order(db, order_id, data, user_id=user.id)
    return OrderOut.from_model(order)


@router.post("/{order_id}/status", response_model=OrderOut)
def update_status(
    order_id: int,
    payload: OrderStatusUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    order = order_service.change_status(
        db, order_id, payload.status, reason=payload.reason, user_id=user.id
    )
    return OrderOut.from_model(order)


@router.post("/{order_id}/split", response_model=OrderOut, status_code=201)
def split_order(
    order_id: int,
    payload: SplitOrderRequest,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    """Carves a deliverable-now quantity off a 'ready_to_ship' order into
    a new child order -- for when stock at dispatch only covers part of
    it. Returns the new child order; GET the original order_id to see
    the parent's own remaining lines."""
    lines = [line.model_dump() for line in payload.lines]
    child = order_service.split_order(db, order_id, lines, user_id=user.id)
    return OrderOut.from_model(child)


@router.post("/{order_id}/approve", response_model=OrderOut)
def approve_order(
    order_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(admin_guard),
):
    """Admin sign-off clearing the large-discount approval gate (Settings
    -> large_discount_approval_threshold) -- a draft order with a large
    discount can't move to 'confirmed' until this has been called."""
    order = order_service.approve_order(db, order_id, user_id=user.id)
    return OrderOut.from_model(order)


@router.delete("/{order_id}")
def delete_order(
    order_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    order_service.delete_order(db, order_id, user_id=user.id)
    return {"message": "Deleted."}


@router.post("/{order_id}/restore", response_model=OrderOut)
def restore_order(
    order_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    order = order_service.restore_order(db, order_id, user_id=user.id)
    return OrderOut.from_model(order)


@router.post("/scan-overdue")
def scan_overdue_orders(
    db: Session = Depends(get_db),
    user: User = Depends(admin_guard),
):
    """Flags open orders past their delivery date with neither a delivery
    note nor a close reason, for admin approval. Run this periodically
    (e.g. an external cron/scheduled task hitting this endpoint daily)."""
    flagged = order_service.escalate_overdue_orders(db)
    return {
        "flagged_count": len(flagged),
        "order_ids": [o.id for o in flagged],
    }


@router.post("/{order_id}/admin-review", response_model=OrderOut)
def admin_review_order(
    order_id: int,
    payload: OrderAdminReview,
    db: Session = Depends(get_db),
    user: User = Depends(admin_guard),
):
    order = order_service.admin_review(db, order_id, payload.notes, user_id=user.id)
    return OrderOut.from_model(order)


@router.get("/{order_id}/pdf")
def download_order_pdf(
    order_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(read_guard),
):
    order = order_service.get_order(db, order_id)
    company_settings = pdf_generator.get_company_settings(db)
    signer = pdf_generator.resolve_signer(db, order.created_by)
    pdf_bytes = pdf_generator.generate_order_pdf(order, company_settings, signer=signer)
    filename = f"{order.order_number}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{order_id}/docx")
def download_order_docx(
    order_id: int,
    language: Literal["en", "ar"] = Query("en"),
    db: Session = Depends(get_db),
    _: User = Depends(read_guard),
):
    order = order_service.get_order(db, order_id)
    context = doc_template_service.build_order_context(db, order)
    docx_bytes = doc_template_service.render_document(db, "order", language, context)
    filename = f"{order.order_number}_{language}.docx"
    return Response(
        content=docx_bytes,
        media_type=doc_template_service.DOCX_MEDIA_TYPE,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/{order_id}/email")
def email_order_pdf(
    order_id: int,
    payload: SendDocumentEmailRequest,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    order = order_service.get_order(db, order_id)
    company_settings = pdf_generator.get_company_settings(db)
    signer = pdf_generator.resolve_signer(db, order.created_by)
    pdf_bytes = pdf_generator.generate_order_pdf(order, company_settings, signer=signer)
    filename = f"{order.order_number}.pdf"

    subject, template_body = email_template_service.render(
        db,
        "order_confirmation",
        {
            "customer_name": order.customer.name if order.customer else "",
            "order_number": order.order_number,
            "order_date": order.order_date.isoformat(),
            "total_amount": f"{float(order.total_amount):,.2f}",
            "company_name": company_settings.get("company_name", ""),
        },
    )
    body = payload.message or template_body
    email_service.send_document_email(
        to_email=payload.to_email,
        subject=subject,
        body=body,
        attachment_bytes=pdf_bytes,
        attachment_filename=filename,
    )
    audit_service.log_update(db, "orders", order_id, {"emailed_to": (None, payload.to_email)}, user.id)
    db.commit()
    return {"message": f"Emailed to {payload.to_email}."}


@router.post("/{order_id}/request-payment", response_model=OrderOut)
def request_payment(
    order_id: int,
    payload: SendDocumentEmailRequest,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    """Emails the order (same PDF as /email) framed as a payment
    request -- amount due, what's already been paid -- rather than a
    plain order confirmation. There's no online payment link yet (see
    payment_service.py): the customer pays outside the app and someone
    records it via POST /{order_id}/payments once it's confirmed to have
    arrived. Records payment_requested_at either way, purely so Sales
    can see "sent N days ago" on the order."""
    order = order_service.get_order(db, order_id)
    company_settings = pdf_generator.get_company_settings(db)
    signer = pdf_generator.resolve_signer(db, order.created_by)
    pdf_bytes = pdf_generator.generate_order_pdf(order, company_settings, signer=signer)
    filename = f"{order.order_number}.pdf"

    amount_paid = payment_service.get_order_amount_paid(db, order_id)
    amount_due = float(order.total_amount) - amount_paid
    today = today_kuwait()
    days_since_order = (today - order.order_date).days
    days_since_last_request = (
        (today - order.payment_requested_at.replace(tzinfo=timezone.utc).astimezone(KUWAIT_TZ).date()).days
        if order.payment_requested_at
        else None
    )

    subject, template_body = email_template_service.render(
        db,
        "payment_reminder",
        {
            "customer_name": order.customer.name if order.customer else "",
            "order_number": order.order_number,
            "total_amount": f"{float(order.total_amount):,.2f}",
            "amount_paid": f"{amount_paid:,.2f}",
            "amount_due": f"{amount_due:,.2f}",
            "amount_paid_note": (
                f" ({amount_paid:,.2f} already received, {amount_due:,.2f} outstanding)" if amount_paid > 0 else ""
            ),
            "days_since_order": str(days_since_order),
            "days_since_last_request": str(days_since_last_request) if days_since_last_request is not None else "-",
            "company_name": company_settings.get("company_name", ""),
        },
    )
    body = payload.message or template_body
    email_service.send_document_email(
        to_email=payload.to_email,
        subject=subject,
        body=body,
        attachment_bytes=pdf_bytes,
        attachment_filename=filename,
    )
    return order_service.mark_payment_requested(db, order_id, user_id=user.id)
