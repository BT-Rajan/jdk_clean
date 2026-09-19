"""Feasibility items new in this pass:
- required_by_date is now a second, independent expiry trigger alongside
  the existing same-day cutoff (see feasibility_service._expire_if_due /
  escalate_expired_feasibility_checks / _past_required_by_date).
- decide_exception now stamps exception_at.
- feasibility_service.get_blocker_summary and
  quotation_service.get_feasibility_blocker surface a still-relevant
  feasibility concern directly on the quotation/order.
"""

from datetime import date, timedelta

from app.services import feasibility_service, quotation_service

from .factories import make_customer, make_product


def _make_feasibility(db, required_by_date, **overrides):
    customer = make_customer(db)
    product = make_product(db)
    feasibility = feasibility_service.create_feasibility(
        db,
        {
            "customer_id": customer.id,
            "required_by_date": required_by_date,
            "lines": [{"product_id": product.id, "quantity": 1}],
        },
    )
    for field, value in overrides.items():
        setattr(feasibility, field, value)
    db.flush()
    return feasibility


def test_expires_once_past_required_by_date_even_within_the_same_day(db):
    # _expire_if_due (called on every read, including get_feasibility at
    # the end of create_feasibility itself) already catches this the
    # moment it's created with a past required_by_date -- so by this
    # point it's expired regardless of which read path triggered it.
    today = date.today()
    feasibility = _make_feasibility(db, required_by_date=today - timedelta(days=1))
    assert feasibility.status == "expired"

    # The periodic scan is idempotent and a no-op for an already-expired
    # check -- it's excluded by the OPEN_STATUSES filter.
    expired = feasibility_service.escalate_expired_feasibility_checks(db)
    assert feasibility.id not in [f.id for f in expired]


def test_scan_catches_a_check_whose_required_by_date_passed_after_creation(db):
    feasibility = _make_feasibility(db, required_by_date=date.today() + timedelta(days=30))
    assert feasibility.status == "draft"

    # Simulate time passing with nothing re-reading (and so re-expiring)
    # this check in between -- exactly what the periodic scan is for.
    feasibility.required_by_date = date.today() - timedelta(days=1)
    db.flush()

    expired = feasibility_service.escalate_expired_feasibility_checks(db)

    assert feasibility.id in [f.id for f in expired]
    assert feasibility.status == "expired"


def test_still_open_before_required_by_date_and_within_the_same_day(db):
    today = date.today()
    feasibility = _make_feasibility(db, required_by_date=today + timedelta(days=30))

    expired = feasibility_service.escalate_expired_feasibility_checks(db)

    assert feasibility.id not in [f.id for f in expired]
    assert feasibility.status == "draft"


def test_decide_exception_stamps_exception_at(db):
    feasibility = _make_feasibility(db, required_by_date=date.today() + timedelta(days=10), status="exception_pending")

    before = feasibility.exception_at
    decided = feasibility_service.decide_exception(db, feasibility.id, approve=False, reason="No supplier available.")

    assert before is None
    assert decided.exception_at is not None
    assert decided.status == "exception_rejected"


def test_blocker_summary_none_for_clean_statuses(db):
    for status in ("feasible", "converted"):
        feasibility = _make_feasibility(db, required_by_date=date.today() + timedelta(days=10), status=status)
        assert feasibility_service.get_blocker_summary(feasibility) is None


def test_blocker_summary_for_approved_override(db):
    feasibility = _make_feasibility(
        db,
        required_by_date=date.today() + timedelta(days=10),
        status="exception_approved",
        exception_reason="Customer accepted a 2-week delay.",
    )

    summary = feasibility_service.get_blocker_summary(feasibility)

    assert summary is not None
    assert "shortfall" in summary
    assert "2-week delay" in summary


def test_blocker_summary_for_a_revived_check(db):
    for status in ("draft", "exception_pending", "exception_rejected", "expired"):
        feasibility = _make_feasibility(db, required_by_date=date.today() + timedelta(days=10), status=status)
        summary = feasibility_service.get_blocker_summary(feasibility)
        assert summary is not None
        assert status in summary


def test_quotation_feasibility_blocker_delegates_to_feasibility_service(db):
    customer = make_customer(db)
    product = make_product(db)
    feasibility = _make_feasibility(db, required_by_date=date.today() + timedelta(days=10), status="feasible")

    quotation = quotation_service.create_quotation(
        db,
        {
            "customer_id": customer.id,
            "quotation_date": date(2026, 1, 1),
            "language": "en",
            "feasibility_id": feasibility.id,
            "lines": [{"product_id": product.id, "quantity": 1, "unit_price": 10, "discount_percent": 0}],
        },
    )

    # create_quotation immediately marks the feasibility 'converted' --
    # a clean resolved case, so no blocker.
    assert quotation_service.get_feasibility_blocker(quotation) is None

    # Simulate the check being revived after the quotation was raised.
    feasibility.status = "draft"
    db.flush()
    db.refresh(quotation)
    assert quotation_service.get_feasibility_blocker(quotation) is not None


def test_quotation_feasibility_blocker_none_for_standalone_quotation(db):
    customer = make_customer(db)
    product = make_product(db)
    quotation = quotation_service.create_quotation(
        db,
        {
            "customer_id": customer.id,
            "quotation_date": date(2026, 1, 1),
            "language": "en",
            "lines": [{"product_id": product.id, "quantity": 1, "unit_price": 10, "discount_percent": 0}],
        },
    )

    assert quotation_service.get_feasibility_blocker(quotation) is None
