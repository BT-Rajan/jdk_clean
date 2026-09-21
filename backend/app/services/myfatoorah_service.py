"""MyFatoorah integration: generates the payment link Finance attaches to
an Invoice, derives its QR code, and lets the webhook handler confirm a
payment server-side rather than trusting whatever a callback claims.

Endpoint/field names below follow MyFatoorah's published v2 API
(SendPayment / GetPaymentStatus) as of this writing -- verify them against
MyFatoorah's current API reference before pointing MYFATOORAH_BASE_URL at
production; API surfaces like this one do shift. See the "Sales ->
Finance Invoice Handoff" design doc's Open Questions for this same caveat.
"""

import base64
from datetime import datetime, timedelta
from io import BytesIO

import qrcode
import requests

from app.core.config import get_settings
from app.core.exceptions import AppError
from app.core.timezone import now_kuwait_naive
from app.models.invoice import Invoice

_TIMEOUT_SECONDS = 20


class MyFatoorahError(AppError):
    """A MyFatoorah call failed or came back unsuccessful -- message is
    already safe to show Finance as-is (MyFatoorah's own validation
    errors are short and specific, e.g. 'Invalid mobile number')."""

    def __init__(self, message: str):
        super().__init__(f"MyFatoorah: {message}", status_code=502)


def _headers() -> dict:
    settings = get_settings()
    if not settings.MYFATOORAH_API_KEY:
        raise MyFatoorahError(
            "No MYFATOORAH_API_KEY configured -- set it in the backend's .env before generating a payment link."
        )
    return {
        "Authorization": f"Bearer {settings.MYFATOORAH_API_KEY}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }


def _post(path: str, payload: dict) -> dict:
    settings = get_settings()
    try:
        response = requests.post(
            f"{settings.MYFATOORAH_BASE_URL}{path}", json=payload, headers=_headers(), timeout=_TIMEOUT_SECONDS
        )
    except requests.RequestException as exc:
        raise MyFatoorahError(f"could not reach MyFatoorah ({exc}).") from exc

    try:
        body = response.json()
    except ValueError:
        raise MyFatoorahError(f"unexpected response (HTTP {response.status_code}).")

    if not response.ok or not body.get("IsSuccess", False):
        errors = body.get("ValidationErrors") or []
        detail = "; ".join(f"{e.get('Name', '')}: {e.get('Error', '')}" for e in errors) or body.get(
            "Message", f"HTTP {response.status_code}"
        )
        raise MyFatoorahError(detail)

    return body.get("Data") or {}


def generate_qr_data_url(payment_link_url: str) -> str:
    """A base64 PNG data URL encoding `payment_link_url` -- generated
    locally the same way pdf_generator._payment_qr_block already does for
    printed documents, never fetched from MyFatoorah (it hands back a
    link, not a QR asset)."""
    image = qrcode.make(payment_link_url)
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def create_payment_link(invoice: Invoice) -> dict:
    """Calls MyFatoorah's SendPayment to create (or, called again,
    re-create -- MyFatoorah treats each call as a new invoice on their
    side) a payment link for this Invoice's order total, then derives its
    QR locally. Returns {payment_link_url, payment_link_ref,
    payment_link_expires_at, qr_data_url} -- exactly what
    invoice_service.generate_payment_link persists; this function never
    touches the database itself."""
    settings = get_settings()
    order = invoice.order
    customer = invoice.customer

    data = _post(
        "/v2/SendPayment",
        {
            "CustomerName": customer.name,
            "CustomerEmail": customer.email or None,
            "CustomerMobile": customer.phone or None,
            "InvoiceValue": float(order.total_amount),
            "CustomerReference": invoice.invoice_number,
            "Language": "en",
            "NotificationOption": "LNK",
        },
    )

    payment_link_url = data.get("InvoiceURL")
    if not payment_link_url:
        raise MyFatoorahError("SendPayment succeeded but returned no InvoiceURL.")

    return {
        "payment_link_url": payment_link_url,
        "payment_link_ref": str(data.get("InvoiceId")) if data.get("InvoiceId") is not None else None,
        "payment_link_expires_at": now_kuwait_naive() + timedelta(days=settings.MYFATOORAH_LINK_EXPIRY_DAYS),
        "qr_data_url": generate_qr_data_url(payment_link_url),
    }


def get_payment_status(payment_link_ref: str) -> dict:
    """Calls MyFatoorah's GetPaymentStatus for `payment_link_ref`
    (InvoiceId) -- the source of truth the webhook handler confirms
    against rather than trusting the callback payload directly, per
    MyFatoorah's own recommended integration pattern. Returns
    {is_paid, amount_paid, raw_status}."""
    data = _post("/v2/GetPaymentStatus", {"Key": payment_link_ref, "KeyType": "InvoiceId"})
    raw_status = data.get("InvoiceStatus", "")
    transactions = data.get("InvoiceTransactions") or []
    amount_paid = sum(
        float(t.get("PaidCurrencyValue", 0)) for t in transactions if t.get("TransactionStatus") == "Succss"
    )
    return {
        "is_paid": raw_status == "Paid",
        "amount_paid": amount_paid,
        "raw_status": raw_status,
    }


def parse_webhook_payload(payload: dict) -> str | None:
    """Pulls the InvoiceId out of a MyFatoorah webhook payload -- callers
    then confirm it via get_payment_status rather than trusting anything
    else in the payload, since the payload itself carries no signature
    this codebase currently verifies (see this module's own docstring
    caveat). Returns None if the payload doesn't look like a MyFatoorah
    callback at all."""
    invoice_id = payload.get("InvoiceId") or payload.get("Data", {}).get("InvoiceId")
    return str(invoice_id) if invoice_id is not None else None
