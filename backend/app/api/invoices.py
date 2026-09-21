from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.api.common import PagedResponse
from app.api.sales_scope_guard import sales_record_scope_guard
from app.core.database import get_db
from app.core.exceptions import ConflictError
from app.core.permissions import has_page_access, require_page_access
from app.models.user import User
from app.schemas.invoice import InvoiceOut, InvoiceStatusOut, InvoiceVoidIn
from app.services import invoice_service, myfatoorah_service, pdf_generator

router = APIRouter(prefix="/api/invoices", tags=["invoices"], dependencies=[Depends(sales_record_scope_guard)])
# Reuses "orders" read/"payments" write, the same guards payments.py
# already uses for Finance-only actions (acknowledge/override/followup) --
# see the design doc's decision to not add a separate "invoices" page_key.
read_guard = require_page_access("orders", "read")
finance_guard = require_page_access("payments", "write")


def _is_finance(db: Session, user: User) -> bool:
    return has_page_access(user, db, "payments", "write")


def _serialize(db: Session, invoice, user: User):
    """Finance (payments write) gets the full view -- payment link, QR,
    MyFatoorah reference. Everyone else (a scoped salesman, the Sales
    Manager, or any other orders-read holder) gets status only -- see
    schemas/invoice.py's InvoiceStatusOut docstring and gap 7."""
    acknowledged = invoice_service.amount_acknowledged(db, invoice)
    if _is_finance(db, user):
        return InvoiceOut.from_model(invoice, amount_acknowledged=acknowledged)
    return InvoiceStatusOut.from_model(invoice, amount_acknowledged=acknowledged)


@router.get("", response_model=PagedResponse)
def list_invoices(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=200),
    search: str | None = Query(None),
    status: str | None = Query(None),
    sort: str | None = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(read_guard),
):
    result = invoice_service.list_invoices(
        db, user=user, status=status, search=search, sort=sort, page=page, page_size=page_size
    )
    result["items"] = [_serialize(db, i, user) for i in result["items"]]
    return result


@router.get("/by-order/{order_id}")
def get_invoice_by_order(
    order_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(read_guard),
):
    invoice = invoice_service.get_invoice_by_order(db, order_id)
    if invoice is None:
        return None
    return _serialize(db, invoice, user)


@router.get("/{invoice_id}")
def get_invoice(
    invoice_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(read_guard),
):
    return _serialize(db, invoice_service.get_invoice(db, invoice_id), user)


@router.get("/{invoice_id}/history")
def get_invoice_history(
    invoice_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(read_guard),
):
    from app.services import audit_service

    invoice_service.get_invoice(db, invoice_id, include_deleted=True)  # 404s if out of scope
    return audit_service.get_history(db, "invoices", invoice_id)


@router.post("/{invoice_id}/generate-link", response_model=InvoiceOut)
def generate_payment_link(
    invoice_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(finance_guard),
):
    """Finance requesting (or regenerating, gap 11) a MyFatoorah payment
    link + QR for this invoice -- Sales never calls this."""
    invoice = invoice_service.get_invoice(db, invoice_id)
    link_data = myfatoorah_service.create_payment_link(invoice)
    invoice = invoice_service.generate_payment_link(db, invoice_id, user_id=user.id, **link_data)
    return InvoiceOut.from_model(invoice, amount_acknowledged=invoice_service.amount_acknowledged(db, invoice))


@router.post("/{invoice_id}/void", response_model=InvoiceOut)
def void_invoice(
    invoice_id: int,
    payload: InvoiceVoidIn,
    db: Session = Depends(get_db),
    user: User = Depends(finance_guard),
):
    invoice = invoice_service.void_invoice(db, invoice_id, payload.reason, user_id=user.id)
    return InvoiceOut.from_model(invoice, amount_acknowledged=invoice_service.amount_acknowledged(db, invoice))


@router.get("/{invoice_id}/pdf")
def download_invoice_pdf(
    invoice_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(read_guard),
):
    """The customer-facing document -- available to anyone who can see
    this invoice at all (not just Finance), same as Sales has always been
    able to print/email an order or quotation. What's withheld from Sales
    in the app's own screens (the raw payment_link_url/qr_data_url
    fields, see InvoiceStatusOut) is exactly what this PDF necessarily
    prints for the customer to actually pay -- those are different
    audiences for the same underlying link."""
    invoice = invoice_service.get_invoice_pdf_context(db, invoice_id)
    if not invoice.payment_link_url:
        raise ConflictError("This invoice has no payment link yet -- nothing to print.")
    company_settings = pdf_generator.get_company_settings(db)
    signer = pdf_generator.resolve_signer(db, invoice.order.created_by)
    pdf_bytes = pdf_generator.generate_invoice_pdf(invoice, company_settings, signer=signer)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{invoice.invoice_number}.pdf"'},
    )
