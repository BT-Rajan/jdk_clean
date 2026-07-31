from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.api.common import PagedResponse
from app.api.deps import get_current_user, require_department_write, require_role
from app.core.database import get_db
from app.models.user import User
from app.schemas.email import SendDocumentEmailRequest
from app.schemas.purchase_order import (
    PurchaseOrderAdminReview,
    PurchaseOrderCreate,
    PurchaseOrderOut,
    PurchaseOrderStatusUpdate,
    PurchaseOrderUpdate,
    ReceivePurchaseOrder,
)
from app.services import audit_service, email_service, pdf_generator, purchase_order_service

router = APIRouter(prefix="/api/purchase-orders", tags=["purchase-orders"])
write_guard = require_department_write("procurement")
admin_guard = require_role("admin")


@router.get("", response_model=PagedResponse)
def list_purchase_orders(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=200),
    search: str | None = Query(None),
    status: str | None = Query(None),
    supplier_id: int | None = Query(None),
    sort: str | None = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = purchase_order_service.list_purchase_orders(
        db, page=page, page_size=page_size, search=search, status=status, supplier_id=supplier_id, sort=sort
    )
    result["items"] = [PurchaseOrderOut.from_model(po) for po in result["items"]]
    return result


@router.get("/{po_id}", response_model=PurchaseOrderOut)
def get_purchase_order(
    po_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return PurchaseOrderOut.from_model(purchase_order_service.get_purchase_order(db, po_id))


@router.get("/{po_id}/history")
def get_purchase_order_history(
    po_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    purchase_order_service.get_purchase_order(db, po_id, include_deleted=True)  # 404s if never existed
    return audit_service.get_history(db, "purchase_orders", po_id)


@router.post("", response_model=PurchaseOrderOut, status_code=201)
def create_purchase_order(
    payload: PurchaseOrderCreate,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    data = payload.model_dump()
    po = purchase_order_service.create_purchase_order(db, data, user_id=user.id)
    return PurchaseOrderOut.from_model(po)


@router.put("/{po_id}", response_model=PurchaseOrderOut)
def update_purchase_order(
    po_id: int,
    payload: PurchaseOrderUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    data = payload.model_dump(exclude_unset=True)
    po = purchase_order_service.update_purchase_order(db, po_id, data, user_id=user.id)
    return PurchaseOrderOut.from_model(po)


@router.post("/{po_id}/status", response_model=PurchaseOrderOut)
def update_status(
    po_id: int,
    payload: PurchaseOrderStatusUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    po = purchase_order_service.change_status(db, po_id, payload.status, reason=payload.reason, user_id=user.id)
    return PurchaseOrderOut.from_model(po)


@router.post("/scan-overdue")
def scan_overdue_purchase_orders(
    db: Session = Depends(get_db),
    user: User = Depends(admin_guard),
):
    """Flags purchase orders past their expected delivery date with
    nothing received and not cancelled -- a supplier running late -- for
    admin approval. Run this periodically (e.g. an external cron/
    scheduled task hitting this endpoint daily)."""
    flagged = purchase_order_service.escalate_overdue_purchase_orders(db)
    return {
        "flagged_count": len(flagged),
        "purchase_order_ids": [po.id for po in flagged],
    }


@router.post("/auto-draft-from-mrp")
def auto_draft_from_mrp(
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    """Drafts a purchase order (always 'draft', never sent) for every
    MRP-identified shortage with a known supplier, grouped by supplier.
    Runs automatically on a schedule (see core/scheduler.py, gated by
    Settings -> Procurement) -- this lets Procurement trigger the same
    pass on demand instead of waiting for the next scheduled run."""
    drafted = purchase_order_service.auto_draft_from_mrp_shortages(db, user_id=user.id)
    return {
        "drafted_count": len(drafted),
        "purchase_order_ids": [po.id for po in drafted],
    }


@router.post("/{po_id}/admin-review", response_model=PurchaseOrderOut)
def admin_review_purchase_order(
    po_id: int,
    payload: PurchaseOrderAdminReview,
    db: Session = Depends(get_db),
    user: User = Depends(admin_guard),
):
    po = purchase_order_service.admin_review(db, po_id, payload.notes, user_id=user.id)
    return PurchaseOrderOut.from_model(po)


@router.post("/{po_id}/receive", response_model=PurchaseOrderOut)
def receive_purchase_order(
    po_id: int,
    payload: ReceivePurchaseOrder,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    receipts = [line.model_dump() for line in payload.lines]
    po = purchase_order_service.receive_lines(db, po_id, receipts, user_id=user.id)
    return PurchaseOrderOut.from_model(po)


@router.delete("/{po_id}")
def delete_purchase_order(
    po_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    purchase_order_service.delete_purchase_order(db, po_id, user_id=user.id)
    return {"message": "Deleted."}


@router.post("/{po_id}/restore", response_model=PurchaseOrderOut)
def restore_purchase_order(
    po_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    po = purchase_order_service.restore_purchase_order(db, po_id, user_id=user.id)
    return PurchaseOrderOut.from_model(po)


@router.get("/{po_id}/pdf")
def download_purchase_order_pdf(
    po_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    po = purchase_order_service.get_purchase_order(db, po_id)
    company_settings = pdf_generator.get_company_settings(db)
    signer = pdf_generator.resolve_signer(db, po.created_by)
    pdf_bytes = pdf_generator.generate_purchase_order_pdf(po, company_settings, signer=signer)
    filename = f"{po.po_number}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/{po_id}/email")
def email_purchase_order_pdf(
    po_id: int,
    payload: SendDocumentEmailRequest,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    po = purchase_order_service.get_purchase_order(db, po_id)
    company_settings = pdf_generator.get_company_settings(db)
    signer = pdf_generator.resolve_signer(db, po.created_by)
    pdf_bytes = pdf_generator.generate_purchase_order_pdf(po, company_settings, signer=signer)
    filename = f"{po.po_number}.pdf"

    body = payload.message or (
        f"Please find attached purchase order {po.po_number}."
    )
    email_service.send_document_email(
        to_email=payload.to_email,
        subject=f"Purchase Order {po.po_number}",
        body=body,
        attachment_bytes=pdf_bytes,
        attachment_filename=filename,
    )
    audit_service.log_update(
        db, "purchase_orders", po_id, {"emailed_to": (None, payload.to_email)}, user.id
    )
    db.commit()
    return {"message": f"Emailed to {payload.to_email}."}
