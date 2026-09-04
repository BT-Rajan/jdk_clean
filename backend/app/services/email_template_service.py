import re

from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError, ValidationAppError
from app.models.email_template import EmailTemplate
from app.services import audit_service

TABLE_NAME = "email_templates"

# The fixed set of templates the app actually sends -- each key
# corresponds to a real trigger elsewhere in the code (see
# order_service._maybe_send_confirmation_email and api/orders.py's
# request_payment). Adding a new automated email means adding a key
# here (with its own default subject/body and the placeholders that
# key's caller fills in) and wiring the trigger to render() it -- the
# row itself is created automatically from this default the first time
# it's read or listed, so a fresh install or an upgrade never needs a
# manual seeding step.
#
# `placeholders` is purely documentation, shown to whoever edits the
# template in Admin -> Documents -- render() below never validates
# against it, so an unrecognized {token} in a template body is left
# untouched rather than raising, and a context key the caller forgot to
# fill in is left untouched the same way.
TEMPLATE_DEFINITIONS: dict[str, dict[str, str]] = {
    "delivery_note_email": {
        "name": "Delivery note email",
        "subject": "Delivery Note {delivery_note_number}",
        "body": (
            "Dear {customer_name},\n\n"
            "Please find attached delivery note {delivery_note_number} for order {order_number}, "
            "dated {delivery_date}.\n\n"
            "{company_name}"
        ),
        "placeholders": "customer_name, delivery_note_number, order_number, delivery_date, company_name",
    },
    "quotation_email": {
        "name": "Quotation email",
        "subject": "Quotation {quotation_number}",
        "body": (
            "Dear {customer_name},\n\n"
            "Please find attached quotation {quotation_number}, dated {quotation_date}, "
            "total {total_amount}.\n\n"
            "{company_name}"
        ),
        "placeholders": "customer_name, quotation_number, quotation_date, total_amount, company_name",
    },
    "order_confirmation": {
        "name": "Order confirmation (first email)",
        "subject": "Order {order_number}",
        "body": (
            "Dear {customer_name},\n\n"
            "Thank you for your order. Please find attached order confirmation {order_number}, "
            "dated {order_date}, total {total_amount}.\n\n"
            "We'll keep you updated as it moves through production and delivery.\n\n"
            "{company_name}"
        ),
        "placeholders": "customer_name, order_number, order_date, total_amount, company_name",
    },
    "payment_reminder": {
        "name": "Payment reminder",
        "subject": "Payment request -- Order {order_number}",
        "body": (
            "Dear {customer_name},\n\n"
            "Payment is due for order {order_number}, total {total_amount}.{amount_paid_note} "
            "Please arrange payment and quote order number {order_number} as the reference. "
            "The order PDF is attached for your records.\n\n"
            "{company_name}"
        ),
        "placeholders": (
            "customer_name, order_number, total_amount, amount_paid, amount_due, amount_paid_note, "
            "days_since_order, days_since_last_request, company_name"
        ),
    },
}


def _default_for(template_key: str) -> dict[str, str]:
    definition = TEMPLATE_DEFINITIONS.get(template_key)
    if definition is None:
        raise NotFoundError("Email template")
    return definition


def _get_or_create(db: Session, template_key: str) -> EmailTemplate:
    row = db.query(EmailTemplate).filter(EmailTemplate.template_key == template_key).first()
    if row is not None:
        return row
    default = _default_for(template_key)
    row = EmailTemplate(
        template_key=template_key, name=default["name"], subject=default["subject"], body=default["body"]
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def list_templates(db: Session) -> list[EmailTemplate]:
    for key in TEMPLATE_DEFINITIONS:
        _get_or_create(db, key)
    return db.query(EmailTemplate).order_by(EmailTemplate.template_key).all()


def get_template(db: Session, template_key: str) -> EmailTemplate:
    _default_for(template_key)  # 404s on an unknown key before touching the DB
    return _get_or_create(db, template_key)


def update_template(db: Session, template_key: str, data: dict, user_id: int | None = None) -> EmailTemplate:
    row = get_template(db, template_key)
    if not data.get("subject", "").strip():
        raise ValidationAppError("Subject is required.")
    if not data.get("body", "").strip():
        raise ValidationAppError("Body is required.")

    changes: dict[str, tuple] = {}
    for field in ("subject", "body"):
        old_value = getattr(row, field)
        new_value = data[field]
        if old_value != new_value:
            changes[field] = (old_value, new_value)
            setattr(row, field, new_value)

    if changes:
        row.updated_by = user_id
        audit_service.log_update(db, TABLE_NAME, row.id, changes, user_id)
        db.commit()
        db.refresh(row)
    return row


_PLACEHOLDER = re.compile(r"\{(\w+)\}")


def _fill(text: str, context: dict[str, str]) -> str:
    """Replaces every {token} found in context, verbatim; any token not
    in context (a typo, or a placeholder meant for a different template)
    is left exactly as written rather than raising -- a template is
    someone's free-text edit, not code, and a stray {token} should read
    as a hint to fix, never break the send."""
    return _PLACEHOLDER.sub(lambda m: context.get(m.group(1), m.group(0)), text)


def render(db: Session, template_key: str, context: dict[str, str]) -> tuple[str, str]:
    """Returns (subject, body) with every {placeholder} in the stored
    template filled in from `context`. Never raises on a missing or
    unexpected context key."""
    row = get_template(db, template_key)
    return _fill(row.subject, context), _fill(row.body, context)
