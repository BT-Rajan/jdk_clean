"""Sales drill-down scoping: the date window and revenue-only switch the
Sales dashboard's Top customers / Top products drill-downs rely on, so the
orders listed are exactly the ones the bar was ranked on."""

from datetime import date

from app.services import report_service

from .factories import make_customer, make_order, make_product


def _numbers(rows):
    return {r["order_number"] for r in rows}


def test_customer_drilldown_matches_the_orders_the_top_customer_bar_counts(db):
    customer = make_customer(db)
    other = make_customer(db)
    make_order(db, customer.id, status="confirmed", order_number="IN-1", order_date=date(2026, 5, 10))
    make_order(db, customer.id, status="delivered", order_number="IN-2", order_date=date(2026, 6, 30))
    make_order(db, customer.id, status="draft", order_number="DRAFT", order_date=date(2026, 6, 1))
    make_order(db, customer.id, status="cancelled", order_number="CANCELLED", order_date=date(2026, 6, 2))
    make_order(db, customer.id, status="confirmed", order_number="TOO-OLD", order_date=date(2025, 1, 1))
    make_order(db, other.id, status="confirmed", order_number="OTHER", order_date=date(2026, 6, 3))

    report = report_service.get_sales_report(db, date_from=date(2026, 5, 1), date_to=date(2026, 6, 30))
    bar = next(c for c in report["top_customers"] if c["customer_id"] == customer.id)

    rows = report_service.get_sales_drilldown(
        db,
        customer_id=customer.id,
        date_from=date(2026, 5, 1),
        date_to=date(2026, 6, 30),
        revenue_only=True,
    )
    assert _numbers(rows) == {"IN-1", "IN-2"}
    assert len(rows) == bar["order_count"]
    assert round(sum(r["total_amount"] for r in rows), 3) == bar["revenue"]


def test_product_drilldown_lists_revenue_orders_containing_the_product(db):
    product = make_product(db)
    keep = make_customer(db)
    make_order(
        db,
        keep.id,
        lines=[{"product_id": product.id, "quantity": 2, "unit_price": 10.0}],
        status="confirmed",
        order_number="HAS-PRODUCT",
        order_date=date(2026, 6, 5),
    )
    make_order(
        db,
        keep.id,
        lines=[{"product_id": product.id, "quantity": 1, "unit_price": 10.0}],
        status="cancelled",
        order_number="CANCELLED-WITH-PRODUCT",
        order_date=date(2026, 6, 6),
    )
    make_order(db, keep.id, status="confirmed", order_number="NO-PRODUCT", order_date=date(2026, 6, 7))

    rows = report_service.get_sales_drilldown(
        db,
        product_id=product.id,
        date_from=date(2026, 6, 1),
        date_to=date(2026, 6, 30),
        revenue_only=True,
    )
    assert _numbers(rows) == {"HAS-PRODUCT"}


def test_date_window_is_inclusive_on_both_ends(db):
    customer = make_customer(db)
    make_order(db, customer.id, status="confirmed", order_number="FIRST", order_date=date(2026, 6, 1))
    make_order(db, customer.id, status="confirmed", order_number="LAST", order_date=date(2026, 6, 30))
    make_order(db, customer.id, status="confirmed", order_number="AFTER", order_date=date(2026, 7, 1))

    rows = report_service.get_sales_drilldown(
        db, customer_id=customer.id, date_from=date(2026, 6, 1), date_to=date(2026, 6, 30)
    )
    assert _numbers(rows) == {"FIRST", "LAST"}


def test_without_the_new_options_behaviour_is_unchanged(db):
    customer = make_customer(db)
    make_order(db, customer.id, status="draft", order_number="D", order_date=date(2020, 1, 1))
    make_order(db, customer.id, status="confirmed", order_number="C", order_date=date(2026, 1, 1))

    rows = report_service.get_sales_drilldown(db, customer_id=customer.id)
    assert _numbers(rows) == {"D", "C"}
