import logging

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.timezone import today_kuwait
from app.models.invoice import Invoice
from app.services import myfatoorah_service, payment_service

logger = logging.getLogger("app.webhooks")

router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])


@router.post("/myfatoorah")
async def myfatoorah_webhook(request: Request, db: Session = Depends(get_db)):
    """MyFatoorah's payment callback. Deliberately does not trust the
    payload's own status field -- see myfatoorah_service's own docstring
    -- it only uses the payload to find *which* invoice this is about,
    then confirms the real status with GetPaymentStatus before recording
    anything. Always returns 200 (MyFatoorah retries on non-2xx): an
    invoice this payload doesn't resolve to, or a payment MyFatoorah
    doesn't yet consider Paid, is simply a no-op, not an error worth
    MyFatoorah retrying forever.
    """
    payload = await request.json()
    payment_link_ref = myfatoorah_service.parse_webhook_payload(payload)
    if payment_link_ref is None:
        logger.info("MyFatoorah webhook: payload carried no InvoiceId, ignoring.")
        return {"status": "ignored"}

    invoice = db.query(Invoice).filter(Invoice.payment_link_ref == payment_link_ref).first()
    if invoice is None:
        logger.info("MyFatoorah webhook: no invoice for payment_link_ref=%s, ignoring.", payment_link_ref)
        return {"status": "ignored"}

    status_data = myfatoorah_service.get_payment_status(payment_link_ref)
    if not status_data["is_paid"] or status_data["amount_paid"] <= 0:
        return {"status": "not_paid_yet"}

    # Finance's own "already confirmed" acknowledgment -- a real MyFatoorah
    # payment is exactly what acknowledged_at means elsewhere in this app
    # (see payment_service.create_payment's auto_acknowledge branch), so
    # this webhook is the system acting with that same authority. The
    # duplicate-reference check in create_payment makes a second delivery
    # of the same webhook a no-op rather than double-counting the payment.
    payment_service.create_payment(
        db,
        invoice.order_id,
        {
            "amount": status_data["amount_paid"],
            "payment_date": today_kuwait(),
            "method": "MyFatoorah",
            "reference": f"MyFatoorah-{payment_link_ref}",
            "notes": "Recorded automatically from the MyFatoorah payment webhook.",
        },
        user_id=None,
        auto_acknowledge=True,
    )
    return {"status": "recorded"}
