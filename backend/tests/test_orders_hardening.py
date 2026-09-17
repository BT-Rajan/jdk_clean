"""Orders hardening upgrade -- covers what's new in this pass:
OrderOut's customer-detail projection and quotation_number resolution
(schemas/order.py + api/orders.py), and list search extended to Client
ID and Quotation Number (services/order_service.py).
"""

from app.models.quotation import Quotation
from app.schemas.order import OrderOut
from app.services import order_service

from .factories import make_customer, make_order


def test_order_out_projects_customer_detail_fields(db):
    customer = make_customer(
        db, name="Gulf Steel Works", customer_number="CUST-500", contact_person="Nasser", phone="96555512345"
    )
    order = make_order(db, customer.id)

    out = OrderOut.from_model(order)
    assert out.customer_number == "CUST-500"
    assert out.customer_contact_person == "Nasser"
    assert out.customer_phone == "96555512345"
    # Not resolved unless the caller passes it in -- see the docstring on
    # OrderOut.quotation_number.
    assert out.quotation_number is None


def test_order_out_accepts_explicit_quotation_number(db):
    customer = make_customer(db)
    order = make_order(db, customer.id)

    out = OrderOut.from_model(order, quotation_number="QUOT-900")
    assert out.quotation_number == "QUOT-900"


def test_search_matches_client_id(db):
    customer = make_customer(db, customer_number="CUST-777")
    make_order(db, customer.id)

    result = order_service.list_orders(db, page=1, page_size=10, search="CUST-777")
    assert result["total"] == 1


def test_search_matches_quotation_number_via_reverse_lookup(db):
    customer = make_customer(db)
    order = make_order(db, customer.id)
    quotation = Quotation(
        quotation_number="QUOT-1234",
        customer_id=customer.id,
        quotation_date="2026-01-01",
        status="converted",
        subtotal_amount=50,
        total_amount=50,
        converted_order_id=order.id,
    )
    db.add(quotation)
    db.flush()

    result = order_service.list_orders(db, page=1, page_size=10, search="QUOT-1234")
    assert result["total"] == 1
    assert result["items"][0].id == order.id

    # An unrelated order's number shouldn't match another order's quotation.
    other_customer = make_customer(db)
    make_order(db, other_customer.id)
    no_match = order_service.list_orders(db, page=1, page_size=10, search="QUOT-1234")
    assert no_match["total"] == 1


def test_search_still_matches_order_number_and_customer_name(db):
    customer = make_customer(db, name="Al Fajr Trading")
    order = make_order(db, customer.id, order_number="ORD-9999")

    by_order_number = order_service.list_orders(db, page=1, page_size=10, search="ORD-9999")
    assert by_order_number["total"] == 1

    by_name = order_service.list_orders(db, page=1, page_size=10, search="Al Fajr")
    assert by_name["total"] == 1
    assert by_name["items"][0].id == order.id
