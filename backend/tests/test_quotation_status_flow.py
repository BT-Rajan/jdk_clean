"""Quotation status flow: there is no 'sent' step. A quotation stays 'draft'
(open) until the customer's answer is recorded -- accepted or rejected --
and 'expired' is set only by the scheduled scan (never chosen by a person).
Covers the transitions, the large-discount gate (now on acceptance),
approval no longer changing status, expiry of open quotations, renewal
back to draft, and the auto-drafted-quotation reminder."""

from datetime import date, datetime

import pytest
from pydantic import ValidationError

from app.core.exceptions import ConflictError
from app.models.quotation import ALLOWED_TRANSITIONS, QUOTATION_STATUSES
from app.models.setting import Setting
from app.schemas.quotation import QuotationStatusUpdate
from app.services import notification_service, quotation_service

from .factories import make_customer, make_product, make_user


def _make_quotation(db, discount_percent=0, **overrides):
    customer = make_customer(db)
    product = make_product(db, selling_price=10)
    quotation = quotation_service.create_quotation(
        db,
        {
            "customer_id": customer.id,
            "quotation_date": overrides.pop("quotation_date", date(2026, 1, 1)),
            "language": "en",
            "lines": [{"product_id": product.id, "quantity": 1, "unit_price": 10, "discount_percent": 0}],
            "discount_percent": discount_percent,
        },
    )
    for field, value in overrides.items():
        setattr(quotation, field, value)
    db.flush()
    return quotation


def test_sent_is_no_longer_a_status():
    assert "sent" not in QUOTATION_STATUSES
    assert all("sent" not in targets for targets in ALLOWED_TRANSITIONS.values())
    assert "sent" not in ALLOWED_TRANSITIONS


def test_a_draft_can_only_move_to_accepted_or_rejected():
    assert ALLOWED_TRANSITIONS["draft"] == {"accepted", "rejected"}


def test_status_endpoint_schema_accepts_only_accepted_or_rejected():
    QuotationStatusUpdate(status="accepted")
    QuotationStatusUpdate(status="rejected", reason="Chose another supplier")
    for bad in ("sent", "expired", "draft", "converted"):
        with pytest.raises(ValidationError):
            QuotationStatusUpdate(status=bad)


def test_draft_goes_straight_to_accepted(db):
    quotation = _make_quotation(db)

    updated = quotation_service.change_status(db, quotation.id, "accepted")

    assert updated.status == "accepted"


def test_draft_goes_straight_to_rejected_with_a_reason(db):
    quotation = _make_quotation(db)

    updated = quotation_service.change_status(db, quotation.id, "rejected", reason="Too expensive")

    assert updated.status == "rejected"
    assert updated.close_reason == "Too expensive"


def test_rejecting_still_requires_a_reason(db):
    quotation = _make_quotation(db)

    with pytest.raises(Exception, match="reason"):
        quotation_service.change_status(db, quotation.id, "rejected")


@pytest.mark.parametrize("target", ["sent", "expired"])
def test_sent_and_expired_cannot_be_set_by_hand(db, target):
    quotation = _make_quotation(db)

    with pytest.raises(ConflictError):
        quotation_service.change_status(db, quotation.id, target)


def test_an_accepted_quotation_cannot_be_rejected_afterwards(db):
    quotation = _make_quotation(db)
    quotation_service.change_status(db, quotation.id, "accepted")

    with pytest.raises(ConflictError):
        quotation_service.change_status(db, quotation.id, "rejected", reason="Changed mind")


# --- large-discount gate now sits on acceptance ---------------------------


def _set_threshold(db, value="20"):
    db.add(Setting(setting_key="large_discount_approval_threshold", setting_value=value))
    db.flush()


def test_a_large_discount_cannot_be_accepted_until_approved(db):
    _set_threshold(db, "20")
    quotation = _make_quotation(db, discount_percent=25)

    with pytest.raises(ConflictError, match="approval.*accepted"):
        quotation_service.change_status(db, quotation.id, "accepted")


def test_a_large_discount_can_still_be_rejected_without_approval(db):
    _set_threshold(db, "20")
    quotation = _make_quotation(db, discount_percent=25)

    updated = quotation_service.change_status(db, quotation.id, "rejected", reason="No budget")

    assert updated.status == "rejected"


def test_approval_records_the_sign_off_without_changing_status(db):
    _set_threshold(db, "20")
    quotation = _make_quotation(db, discount_percent=25)
    admin = make_user(db, role="admin", department_id=None)

    approved = quotation_service.approve_quotation(db, quotation.id, user_id=admin.id)

    assert approved.status == "draft"
    assert approved.approved_at is not None
    assert approved.approved_by == admin.id


def test_an_approved_large_discount_can_then_be_accepted(db):
    _set_threshold(db, "20")
    quotation = _make_quotation(db, discount_percent=25)
    admin = make_user(db, role="admin", department_id=None)
    quotation_service.approve_quotation(db, quotation.id, user_id=admin.id)

    updated = quotation_service.change_status(db, quotation.id, "accepted")

    assert updated.status == "accepted"


def test_a_small_discount_needs_no_approval_to_be_accepted(db):
    _set_threshold(db, "20")
    quotation = _make_quotation(db, discount_percent=5)

    assert quotation_service.change_status(db, quotation.id, "accepted").status == "accepted"


# --- expiry now applies to open (draft) quotations ------------------------


def test_scan_expires_an_open_quotation_past_its_validity(db):
    quotation = _make_quotation(db, valid_until=date(2026, 1, 8))

    expired = quotation_service.escalate_expired_quotations(db, as_of=date(2026, 1, 9))

    assert [q.id for q in expired] == [quotation.id]
    assert quotation_service.get_quotation(db, quotation.id).status == "expired"


def test_scan_leaves_a_quotation_still_within_its_validity(db):
    quotation = _make_quotation(db, valid_until=date(2026, 1, 8))

    assert quotation_service.escalate_expired_quotations(db, as_of=date(2026, 1, 8)) == []
    assert quotation_service.get_quotation(db, quotation.id).status == "draft"


def test_scan_never_touches_a_decided_quotation(db):
    accepted = _make_quotation(db, status="accepted", valid_until=date(2026, 1, 8))
    rejected = _make_quotation(db, status="rejected", valid_until=date(2026, 1, 8))

    assert quotation_service.escalate_expired_quotations(db, as_of=date(2027, 1, 1)) == []
    assert quotation_service.get_quotation(db, accepted.id).status == "accepted"
    assert quotation_service.get_quotation(db, rejected.id).status == "rejected"


def test_renewing_an_expired_quotation_reopens_it_as_a_draft(db):
    quotation = _make_quotation(db, status="expired", valid_until=date(2026, 1, 8))

    renewed = quotation_service.renew_quotation(db, quotation.id)

    assert renewed.status == "draft"
    # ...and it can then be decided like any open quotation.
    assert quotation_service.change_status(db, quotation.id, "accepted").status == "accepted"


# --- auto-drafted quotation reminder --------------------------------------


def _auto_draft_items(db, user):
    return [i for i in notification_service.get_notifications(db, user) if i["type"] == "quotation_auto_draft_unreviewed"]


def test_auto_drafted_quotation_shows_a_reminder_until_it_is_emailed(db):
    admin = make_user(db, role="admin", department_id=None)
    quotation = _make_quotation(db, auto_created=True)

    assert [i["link"] for i in _auto_draft_items(db, admin)] == [f"/quotations/{quotation.id}"]

    quotation.last_emailed_at = datetime(2026, 1, 2, 9, 0)
    db.flush()

    assert _auto_draft_items(db, admin) == []
