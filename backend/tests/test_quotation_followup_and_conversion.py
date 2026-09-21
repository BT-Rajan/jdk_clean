"""Quotation follow-up tracking, conversion-status visibility, and the
expired-quotation send guard -- all new in this pass. See
quotation_service.get_followup_status/get_conversion_status/
record_followup/renew_quotation/assert_sendable, and
order_service.create_order_from_quotation's reuse of
get_conversion_status.
"""

from datetime import date, timedelta

import pytest

from app.core.exceptions import ConflictError, ValidationAppError
from app.services import order_service, quotation_service

from .factories import make_customer, make_product


def _make_quotation(db, status="draft", **overrides):
    customer = make_customer(db)
    product = make_product(db, selling_price=10)
    quotation_date = overrides.pop("quotation_date", date(2026, 1, 1))
    quotation = quotation_service.create_quotation(
        db,
        {
            "customer_id": customer.id,
            "quotation_date": quotation_date,
            "language": "en",
            "lines": [{"product_id": product.id, "quantity": 1, "unit_price": 10, "discount_percent": 0}],
        },
    )
    if status != "draft":
        quotation.status = status
    for field, value in overrides.items():
        setattr(quotation, field, value)
    db.flush()
    return quotation


def test_conversion_status_not_accepted(db):
    quotation = _make_quotation(db)

    status, reasons = quotation_service.get_conversion_status(quotation)

    assert status == "blocked"
    assert "must be accepted" in reasons[0]


def test_conversion_status_ready(db):
    # No payment link gate any more -- 'accepted' alone is enough (see
    # the "Sales -> Finance Invoice Handoff" design doc: the commercial
    # handoff to Finance now happens after conversion, via the Invoice
    # auto-created on order confirm, not before it).
    quotation = _make_quotation(db, status="accepted")

    status, reasons = quotation_service.get_conversion_status(quotation)

    assert status == "ready"
    assert reasons == []


def test_conversion_status_converted(db):
    quotation = _make_quotation(db, status="converted")

    status, reasons = quotation_service.get_conversion_status(quotation)

    assert status == "converted"
    assert reasons == []


def test_create_order_from_quotation_succeeds_once_accepted(db):
    quotation = _make_quotation(db, status="accepted")

    order = order_service.create_order_from_quotation(db, quotation.id)

    assert order.status == "draft"
    assert order.customer_id == quotation.customer_id


def test_assert_sendable_blocks_expired_quotation(db):
    quotation = _make_quotation(db, status="expired")

    with pytest.raises(ConflictError, match="renew"):
        quotation_service.assert_sendable(quotation)


def test_assert_sendable_allows_non_expired_quotation(db):
    quotation = _make_quotation(db)

    quotation_service.assert_sendable(quotation)  # must not raise


def test_renew_quotation_extends_validity_and_reopens_to_draft(db):
    quotation = _make_quotation(db, status="expired", valid_until=date(2026, 1, 8))

    renewed = quotation_service.renew_quotation(db, quotation.id)

    assert renewed.status == "draft"
    assert renewed.valid_until > date(2026, 1, 8)
    quotation_service.assert_sendable(renewed)  # no longer blocked


def test_renew_quotation_rejects_non_expired(db):
    quotation = _make_quotation(db)

    with pytest.raises(ConflictError, match="expired"):
        quotation_service.renew_quotation(db, quotation.id)


def test_renew_quotation_rejects_a_past_valid_until(db):
    quotation = _make_quotation(db, status="expired")

    with pytest.raises(ValidationAppError, match="future"):
        quotation_service.renew_quotation(db, quotation.id, valid_until=date(2020, 1, 1))


def test_followup_status_not_due_with_no_date_set(db):
    quotation = _make_quotation(db)

    assert quotation_service.get_followup_status(quotation) == "not_due"


def test_followup_status_overdue_and_due_and_future(db):
    quotation = _make_quotation(db)
    today = date(2026, 6, 15)

    quotation.next_followup_date = date(2026, 6, 10)
    assert quotation_service.get_followup_status(quotation, today) == "overdue"

    quotation.next_followup_date = today
    assert quotation_service.get_followup_status(quotation, today) == "due"

    quotation.next_followup_date = date(2026, 6, 20)
    assert quotation_service.get_followup_status(quotation, today) == "not_due"


def test_followup_status_completed_for_terminal_statuses(db):
    for status in ("rejected", "expired", "converted"):
        quotation = _make_quotation(db, status=status, next_followup_date=date(2020, 1, 1))
        assert quotation_service.get_followup_status(quotation) == "completed"


def test_record_followup_defaults_next_date_to_the_standard_interval(db):
    quotation = _make_quotation(db)

    updated = quotation_service.record_followup(db, quotation.id)

    assert updated.last_followup_at is not None
    assert updated.next_followup_date == quotation_service.today_kuwait() + timedelta(
        days=quotation_service.FOLLOWUP_INTERVAL_DAYS
    )


def test_record_followup_accepts_an_explicit_next_date(db):
    quotation = _make_quotation(db)

    updated = quotation_service.record_followup(db, quotation.id, next_followup_date=date(2030, 5, 1))

    assert updated.next_followup_date == date(2030, 5, 1)


def test_record_followup_rejected_on_a_terminal_quotation(db):
    quotation = _make_quotation(db, status="rejected")

    with pytest.raises(ConflictError, match="No follow-up is needed"):
        quotation_service.record_followup(db, quotation.id)
