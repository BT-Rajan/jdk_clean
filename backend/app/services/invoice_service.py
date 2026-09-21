from sqlalchemy.orm import Session, joinedload

from app.core.exceptions import ConflictError, NotFoundError, ValidationAppError
from app.core.pagination import sort_and_paginate
from app.core.sales_scope import scope_by_customer
from app.core.timezone import now_kuwait_naive
from app.core.workflow import assert_reason_given
from app.models.invoice import (
    LINK_GENERATABLE_STATUSES,
    PAYMENT_REQUESTED_STATUSES,
    VOIDABLE_STATUSES,
    Invoice,
)
from app.models.order import Order
from app.services import audit_service, number_series_service

TABLE_NAME = "invoices"


def _base_query(db: Session, include_deleted: bool = False):
    query = db.query(Invoice).options(
        joinedload(Invoice.order),
        joinedload(Invoice.quotation),
        joinedload(Invoice.customer),
    )
    if not include_deleted:
        query = query.filter(Invoice.deleted_at.is_(None))
    return query


def get_invoice(db: Session, invoice_id: int, include_deleted: bool = False) -> Invoice:
    obj = _base_query(db, include_deleted).filter(Invoice.id == invoice_id).first()
    if obj is None:
        raise NotFoundError("Invoice")
    return obj


def get_invoice_by_order(db: Session, order_id: int) -> Invoice | None:
    return _base_query(db).filter(Invoice.order_id == order_id).first()


def list_invoices(
    db: Session,
    user=None,
    status: str | None = None,
    search: str | None = None,
    sort: str | None = None,
    page: int = 1,
    page_size: int = 25,
) -> dict:
    query = scope_by_customer(_base_query(db), Invoice.customer_id, user)
    if status:
        query = query.filter(Invoice.status == status)
    if search:
        like = f"%{search.strip()}%"
        query = (
            query.join(Order, Invoice.order_id == Order.id)
            .filter(Invoice.invoice_number.ilike(like) | Order.order_number.ilike(like))
        )
    return sort_and_paginate(
        query,
        Invoice,
        {"invoice_number": Invoice.invoice_number, "status": Invoice.status, "created_at": Invoice.created_at},
        sort,
        page,
        page_size,
    )


def amount_acknowledged(db: Session, invoice: Invoice) -> float:
    # Local import: payment_service imports this module back (to sync
    # invoice status after a payment event), so this stays a function-level
    # import rather than a module-level one -- same pattern order_service
    # uses for quotation_service.
    from app.services import payment_service

    return payment_service.get_order_amount_acknowledged(db, invoice.order_id)


def create_draft_invoice_for_order(db: Session, order_id: int, user_id: int | None = None) -> Invoice:
    """Fired by order_service.change_status the moment an order first
    reaches 'confirmed' -- Sales never creates this directly, and it's
    never a second invoice for the same order: order_id is UNIQUE, and
    ALLOWED_TRANSITIONS only ever lets an order reach 'confirmed' once, so
    a retried/duplicate confirm call can't double-invoice (see order.py's
    ALLOWED_TRANSITIONS comment). Lands the invoice straight at
    'waiting_finance' -- 'draft' is momentary, not something anyone acts on
    in between, but it's still its own status/audit entry so the trail
    shows the handoff actually happened rather than the invoice simply
    appearing already routed.
    """
    existing = get_invoice_by_order(db, order_id)
    if existing is not None:
        return existing

    order = db.query(Order).filter(Order.id == order_id).first()
    if order is None:
        raise NotFoundError("Order")

    # Local import: quotation_service isn't otherwise needed by this
    # module -- same avoid-a-cycle reasoning as order_service's own local
    # import of quotation_service.
    from app.models.quotation import Quotation

    quotation = (
        db.query(Quotation).filter(Quotation.converted_order_id == order_id, Quotation.deleted_at.is_(None)).first()
    )

    invoice_number = number_series_service.next_number(db, "INVOICE")
    invoice = Invoice(
        invoice_number=invoice_number,
        order_id=order_id,
        quotation_id=quotation.id if quotation else None,
        customer_id=order.customer_id,
        status="draft",
        created_by=user_id,
    )
    db.add(invoice)
    db.flush()
    audit_service.log_create(db, TABLE_NAME, invoice.id, user_id)

    invoice.status = "waiting_finance"
    invoice.updated_by = user_id
    audit_service.log_update(db, TABLE_NAME, invoice.id, {"status": ("draft", "waiting_finance")}, user_id)
    db.commit()
    db.refresh(invoice)
    return invoice


def generate_payment_link(
    db: Session,
    invoice_id: int,
    *,
    payment_link_url: str,
    payment_link_ref: str | None,
    payment_link_expires_at,
    qr_data_url: str,
    user_id: int | None = None,
) -> Invoice:
    """Records a (re)generated MyFatoorah link -- called by
    api/invoices.py after myfatoorah_service.create_payment_link actually
    talks to MyFatoorah; this function only ever persists what that call
    already produced. Same call for the first link and every regeneration
    after (gap 11): overwrites in place and bumps `version`, never inserts
    a second invoice. Advances status to 'awaiting_payment' the first
    time; a regeneration against an invoice that already has partial
    payment recorded (`partially_paid`) keeps that progress instead of
    reverting it.
    """
    invoice = get_invoice(db, invoice_id)
    if invoice.status not in LINK_GENERATABLE_STATUSES:
        raise ConflictError(
            f"Cannot generate a payment link for an invoice in status '{invoice.status}'."
        )

    old_status = invoice.status
    invoice.payment_link_url = payment_link_url
    invoice.payment_link_ref = payment_link_ref
    invoice.payment_link_expires_at = payment_link_expires_at
    invoice.qr_data_url = qr_data_url
    invoice.version += 1
    if invoice.status in ("waiting_finance", "link_generated", "qr_ready"):
        invoice.status = "awaiting_payment"
    invoice.updated_by = user_id
    audit_service.log_update(
        db,
        TABLE_NAME,
        invoice.id,
        {
            "status": (old_status, invoice.status),
            "payment_link_url": (None, payment_link_url),
            "version": (invoice.version - 1, invoice.version),
        },
        user_id,
    )
    db.commit()
    db.refresh(invoice)
    return invoice


def void_invoice(db: Session, invoice_id: int, reason: str, user_id: int | None = None) -> Invoice:
    """Finance (or order_service, auto-voiding pre-payment on order
    cancellation -- see that module's change_status) writing this invoice
    off. Blocked once 'paid' (nothing left to void) or already 'voided'.
    A live payment request (awaiting_payment/partially_paid) can still be
    voided here directly -- it's only order_service's own cancellation
    path that refuses to reach this automatically once a payment request
    is live (see PAYMENT_REQUESTED_STATUSES); a direct Finance-initiated
    void is a deliberate call, not an accidental side effect."""
    assert_reason_given(reason, "A reason is required to void an invoice.")
    invoice = get_invoice(db, invoice_id)
    if invoice.status not in VOIDABLE_STATUSES:
        raise ConflictError(f"Cannot void an invoice in status '{invoice.status}'.")

    old_status = invoice.status
    invoice.status = "voided"
    invoice.voided_at = now_kuwait_naive()
    invoice.voided_by = user_id
    invoice.voided_reason = reason
    invoice.updated_by = user_id
    audit_service.log_update(db, TABLE_NAME, invoice.id, {"status": (old_status, "voided")}, user_id)
    db.commit()
    db.refresh(invoice)
    return invoice


def sync_status_from_payments(db: Session, order_id: int, user_id: int | None = None) -> None:
    """Called after payment_service creates/acknowledges/deletes a payment
    against this order -- derives paid/partially_paid straight from the
    acknowledged total, never from a separate flag someone could set by
    hand (gap 6: link generation and payment receipt stay provably
    separate states). A no-op for an order with no invoice yet, or whose
    invoice hasn't reached 'awaiting_payment' yet (a payment logged before
    Finance has even generated a link is out-of-band -- it doesn't drag
    the invoice's own state machine forward on its own)."""
    invoice = get_invoice_by_order(db, order_id)
    if invoice is None or invoice.status not in PAYMENT_REQUESTED_STATUSES:
        return

    acknowledged = amount_acknowledged(db, invoice)
    total = float(invoice.order.total_amount)
    if acknowledged >= total - 0.01:
        new_status = "paid"
    elif acknowledged > 0:
        new_status = "partially_paid"
    else:
        new_status = "awaiting_payment"

    if new_status == invoice.status:
        return

    old_status = invoice.status
    invoice.status = new_status
    invoice.updated_by = user_id
    audit_service.log_update(db, TABLE_NAME, invoice.id, {"status": (old_status, new_status)}, user_id)
    db.commit()


def void_for_order_cancellation(db: Session, order_id: int, reason: str, user_id: int | None = None) -> None:
    """order_service.change_status's own hook for the 'cancelled' branch:
    auto-voids this order's invoice, but only ever reaches an invoice
    still pre-payment (order_service itself refuses the cancellation
    outright once PAYMENT_REQUESTED_STATUSES -- see that function -- so
    this is never called against a live payment request)."""
    invoice = get_invoice_by_order(db, order_id)
    if invoice is None or invoice.status not in VOIDABLE_STATUSES:
        return
    void_invoice(db, invoice.id, reason, user_id=user_id)


def assert_cancellable(db: Session, order: Order) -> None:
    """Raises if `order` has an invoice with a live payment request --
    called by order_service.change_status before allowing a 'cancelled'
    transition (gap 12: an approved order with a payment link already out
    must not be cancelled out from under Finance without them voiding it
    first)."""
    invoice = get_invoice_by_order(db, order.id)
    if invoice is not None and invoice.status in PAYMENT_REQUESTED_STATUSES:
        raise ConflictError(
            f"{order.order_number} has an invoice awaiting or receiving payment "
            f"({invoice.invoice_number}, status '{invoice.status}') -- Finance must void it before this order can be cancelled."
        )


def clone_invoice_for_split_order(
    db: Session, source_order_id: int, new_order_id: int, user_id: int | None = None
) -> Invoice | None:
    """order_service.split_order's own hook: the child order carved off a
    partially-deliverable order is the same underlying sale, not a new
    commitment (see that function's own comment), so it inherits the
    parent's invoice as a starting copy -- same link/QR/status/version --
    rather than being routed through Finance again from scratch. A no-op
    (returns None) if the source order has no invoice yet (e.g. it was
    split before ever being confirmed, which shouldn't normally happen
    but isn't this function's place to assert against)."""
    source = get_invoice_by_order(db, source_order_id)
    if source is None:
        return None

    invoice_number = number_series_service.next_number(db, "INVOICE")
    clone = Invoice(
        invoice_number=invoice_number,
        order_id=new_order_id,
        quotation_id=source.quotation_id,
        customer_id=source.customer_id,
        status=source.status,
        version=source.version,
        payment_link_url=source.payment_link_url,
        payment_link_ref=source.payment_link_ref,
        payment_link_expires_at=source.payment_link_expires_at,
        qr_data_url=source.qr_data_url,
        created_by=user_id,
    )
    db.add(clone)
    db.flush()
    audit_service.log_create(db, TABLE_NAME, clone.id, user_id)
    db.commit()
    db.refresh(clone)
    return clone


def get_invoice_pdf_context(db: Session, invoice_id: int) -> Invoice:
    """Thin wrapper so api/invoices.py's PDF/print endpoint goes through
    the same sales-scope-guarded get_invoice as everything else, rather
    than querying Invoice directly."""
    return get_invoice(db, invoice_id)
