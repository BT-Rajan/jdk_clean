"""Regression test for quotation_service's 7-day validity rule (Pass
1) -- rule #1 from the test brief's "recent business rules" list.
"""

from datetime import date, timedelta

from app.services import quotation_service

from .factories import make_customer, make_product


def test_valid_until_is_always_quotation_date_plus_seven_days(db):
    customer = make_customer(db)
    product = make_product(db, selling_price=10)
    quotation_date = date(2026, 3, 10)

    quotation = quotation_service.create_quotation(
        db,
        {
            "customer_id": customer.id,
            "quotation_date": quotation_date,
            "valid_until": None,  # never trusted -- server always derives it
            "language": "en",
            "lines": [{"product_id": product.id, "quantity": 1, "unit_price": 10, "discount_percent": 0}],
        },
    )

    assert quotation.valid_until == quotation_date + timedelta(days=7)


def test_client_supplied_valid_until_is_ignored(db):
    """Even a caller that tries to set an arbitrary validity window gets
    the server-derived 7-day date instead -- there's no legitimate
    override mechanism for this (see quotation_service.py's
    QUOTATION_VALIDITY_DAYS comment)."""
    customer = make_customer(db)
    product = make_product(db, selling_price=10)
    quotation_date = date(2026, 6, 1)

    quotation = quotation_service.create_quotation(
        db,
        {
            "customer_id": customer.id,
            "quotation_date": quotation_date,
            "valid_until": date(2030, 1, 1),  # deliberately wrong -- must be overridden
            "language": "en",
            "lines": [{"product_id": product.id, "quantity": 1, "unit_price": 10, "discount_percent": 0}],
        },
    )

    assert quotation.valid_until == quotation_date + timedelta(days=7)
