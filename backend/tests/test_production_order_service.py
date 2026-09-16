"""Regression tests for production_order_service -- the P2 Production
Order pass. Covers the UAT scenarios from the P2 spec: normal creation,
partial-then-remainder creation, over-allocation rejection, ineligible-
order rejection, and cancellation leaving the customer order and
inventory untouched. Concurrent-request safety (the FOR UPDATE locking
read in _committed_quantity) was verified empirically against this app's
actual MariaDB setup during development -- see the P2 implementation
report -- rather than as an automated test, matching this codebase's
existing convention of not exercising true multi-connection concurrency
in pytest (no other service's locking pattern is tested that way either).
"""

from datetime import date

import pytest

from app.core.exceptions import ConflictError, ValidationAppError
from app.services import inventory_service, production_order_service

from .factories import make_customer, make_order, make_product

TODAY = date(2026, 1, 15)
DUE = date(2026, 2, 1)


def _confirmed_order(db, quantity: float = 500):
    customer = make_customer(db)
    product = make_product(db)
    order = make_order(
        db,
        customer.id,
        lines=[{"product_id": product.id, "quantity": quantity, "unit_price": 10}],
        status="confirmed",
    )
    return order, order.lines[0], product


def test_create_from_confirmed_order_full_quantity(db):
    order, line, product = _confirmed_order(db, 500)

    po = production_order_service.create_production_order(
        db,
        {
            "order_id": order.id,
            "order_detail_id": line.id,
            "planned_quantity": 500,
            "due_date": DUE,
        },
    )

    assert po.status == "planned"
    assert po.order_id == order.id
    assert po.order_detail_id == line.id
    assert po.product_id == product.id
    assert float(po.planned_quantity) == 500
    assert po.production_order_number.startswith("PRO-")


def test_partial_then_remainder_succeeds_and_tracks_remaining(db):
    order, line, _ = _confirmed_order(db, 500)

    first = production_order_service.create_production_order(
        db, {"order_id": order.id, "order_detail_id": line.id, "planned_quantity": 300, "due_date": DUE}
    )
    assert production_order_service.get_remaining_quantity(db, line.id) == 200

    second = production_order_service.create_production_order(
        db, {"order_id": order.id, "order_detail_id": line.id, "planned_quantity": 200, "due_date": DUE}
    )
    assert production_order_service.get_remaining_quantity(db, line.id) == 0
    assert first.id != second.id


def test_over_allocation_rejected_and_nothing_created(db):
    order, line, _ = _confirmed_order(db, 500)
    production_order_service.create_production_order(
        db, {"order_id": order.id, "order_detail_id": line.id, "planned_quantity": 300, "due_date": DUE}
    )
    production_order_service.create_production_order(
        db, {"order_id": order.id, "order_detail_id": line.id, "planned_quantity": 200, "due_date": DUE}
    )

    with pytest.raises(ValidationAppError):
        production_order_service.create_production_order(
            db, {"order_id": order.id, "order_detail_id": line.id, "planned_quantity": 1, "due_date": DUE}
        )

    result = production_order_service.list_production_orders(db, order_id=order.id)
    assert result["total"] == 2  # the rejected attempt created no third row


def test_planned_quantity_above_remaining_is_rejected_even_as_first_attempt(db):
    order, line, _ = _confirmed_order(db, 500)

    with pytest.raises(ValidationAppError):
        production_order_service.create_production_order(
            db, {"order_id": order.id, "order_detail_id": line.id, "planned_quantity": 501, "due_date": DUE}
        )


@pytest.mark.parametrize("status", ["draft", "cancelled", "ready_to_ship", "shipped", "delivered"])
def test_creation_rejected_for_ineligible_order_status(db, status):
    customer = make_customer(db)
    product = make_product(db)
    order = make_order(
        db, customer.id, lines=[{"product_id": product.id, "quantity": 100, "unit_price": 10}], status=status
    )

    with pytest.raises(ConflictError):
        production_order_service.create_production_order(
            db,
            {"order_id": order.id, "order_detail_id": order.lines[0].id, "planned_quantity": 10, "due_date": DUE},
        )

    assert production_order_service.list_production_orders(db, order_id=order.id)["total"] == 0


def test_creation_rejected_for_inactive_product(db):
    customer = make_customer(db)
    product = make_product(db, status="inactive")
    order = make_order(
        db, customer.id, lines=[{"product_id": product.id, "quantity": 100, "unit_price": 10}], status="confirmed"
    )

    with pytest.raises(ValidationAppError):
        production_order_service.create_production_order(
            db,
            {"order_id": order.id, "order_detail_id": order.lines[0].id, "planned_quantity": 10, "due_date": DUE},
        )


def test_order_detail_must_belong_to_the_given_order(db):
    order_a, line_a, _ = _confirmed_order(db, 500)
    order_b, _, _ = _confirmed_order(db, 500)

    with pytest.raises(ValidationAppError):
        production_order_service.create_production_order(
            db,
            {"order_id": order_b.id, "order_detail_id": line_a.id, "planned_quantity": 10, "due_date": DUE},
        )


def test_cancel_requires_a_reason(db):
    order, line, _ = _confirmed_order(db, 500)
    po = production_order_service.create_production_order(
        db, {"order_id": order.id, "order_detail_id": line.id, "planned_quantity": 100, "due_date": DUE}
    )

    with pytest.raises(ValidationAppError):
        production_order_service.change_status(db, po.id, "cancelled", reason=None)


def test_cancel_leaves_order_status_and_inventory_untouched(db):
    order, line, product = _confirmed_order(db, 500)
    po = production_order_service.create_production_order(
        db, {"order_id": order.id, "order_detail_id": line.id, "planned_quantity": 100, "due_date": DUE}
    )
    stock_before = inventory_service.get_stock(db, "product", product.id)

    cancelled = production_order_service.change_status(db, po.id, "cancelled", reason="Customer changed the spec.")

    assert cancelled.status == "cancelled"
    assert cancelled.cancel_reason == "Customer changed the spec."
    db.refresh(order)
    assert order.status == "confirmed"  # untouched -- see docs/production-lifecycle.md's Cancellation section
    stock_after = inventory_service.get_stock(db, "product", product.id)
    assert stock_after == stock_before  # no stock movement of any kind


def test_cancelling_a_production_order_frees_its_committed_quantity(db):
    order, line, _ = _confirmed_order(db, 500)
    po = production_order_service.create_production_order(
        db, {"order_id": order.id, "order_detail_id": line.id, "planned_quantity": 300, "due_date": DUE}
    )
    assert production_order_service.get_remaining_quantity(db, line.id) == 200

    production_order_service.change_status(db, po.id, "cancelled", reason="No longer needed.")

    assert production_order_service.get_remaining_quantity(db, line.id) == 500


def test_cancelled_is_terminal(db):
    order, line, _ = _confirmed_order(db, 500)
    po = production_order_service.create_production_order(
        db, {"order_id": order.id, "order_detail_id": line.id, "planned_quantity": 100, "due_date": DUE}
    )
    production_order_service.change_status(db, po.id, "cancelled", reason="Duplicate entry.")

    with pytest.raises(ConflictError):
        production_order_service.change_status(db, po.id, "cancelled", reason="Again.")
