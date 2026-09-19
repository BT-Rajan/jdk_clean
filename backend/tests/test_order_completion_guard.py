"""Order-level Next Action, the completion guard on 'delivered', and
cancellation-effects visibility -- all new in this pass. See
order_service.get_next_action, _assert_order_completable, and
change_status's cancellation_effects; and
production_service.get_resulting_unscheduled_quantity for the
production-batch side.
"""

from datetime import date

import pytest

from app.core.exceptions import ConflictError
from app.services import order_service, payment_service, production_service

from .factories import make_customer, make_delivery_note, make_order, make_product, make_production_schedule


def test_next_action_draft_says_confirm(db):
    customer = make_customer(db)
    order = make_order(db, customer.id)

    assert order_service.get_next_action(db, order) == "Confirm this order to reserve stock and begin fulfilment."


def test_next_action_cancelled_says_none(db):
    customer = make_customer(db)
    order = make_order(db, customer.id, status="cancelled")

    assert order_service.get_next_action(db, order).startswith("None")


def test_next_action_ready_to_ship_says_issue_delivery_note(db):
    customer = make_customer(db)
    order = make_order(db, customer.id, status="ready_to_ship")

    assert order_service.get_next_action(db, order) == "Issue a delivery note to ship this order."


def test_next_action_shipped_fully_settled_says_mark_delivered(db):
    customer = make_customer(db)
    product = make_product(db)
    order = make_order(
        db, customer.id, lines=[{"product_id": product.id, "quantity": 10, "unit_price": 5.0}], status="shipped"
    )
    make_delivery_note(db, order.id, lines=[{"product_id": product.id, "quantity_delivered": 10}], status="issued")
    payment_service.create_payment(db, order.id, {"amount": 50, "payment_date": date(2026, 1, 1)})

    assert order_service.get_next_action(db, order) == "Mark this order as delivered."


def test_next_action_shipped_with_balance_due_says_collect_payment(db):
    customer = make_customer(db)
    product = make_product(db)
    order = make_order(
        db, customer.id, lines=[{"product_id": product.id, "quantity": 10, "unit_price": 5.0}], status="shipped"
    )
    make_delivery_note(db, order.id, lines=[{"product_id": product.id, "quantity_delivered": 10}], status="issued")

    assert order_service.get_next_action(db, order) == "Collect the outstanding balance of 50.00."


def test_cannot_mark_delivered_with_open_production_batch(db):
    customer = make_customer(db)
    product = make_product(db)
    order = make_order(
        db, customer.id, lines=[{"product_id": product.id, "quantity": 10, "unit_price": 5.0}], status="shipped"
    )
    make_delivery_note(db, order.id, lines=[{"product_id": product.id, "quantity_delivered": 10}], status="issued")
    payment_service.create_payment(db, order.id, {"amount": 50, "payment_date": date(2026, 1, 1)})
    make_production_schedule(db, product.id, 5, date(2026, 1, 1), date(2026, 1, 2), order_id=order.id)

    with pytest.raises(ConflictError, match="production batch"):
        order_service.change_status(db, order.id, "delivered")


def test_cannot_mark_delivered_with_undelivered_quantity(db):
    customer = make_customer(db)
    product = make_product(db)
    order = make_order(
        db, customer.id, lines=[{"product_id": product.id, "quantity": 10, "unit_price": 5.0}], status="shipped"
    )
    make_delivery_note(db, order.id, lines=[{"product_id": product.id, "quantity_delivered": 6}], status="issued")
    payment_service.create_payment(db, order.id, {"amount": 50, "payment_date": date(2026, 1, 1)})

    with pytest.raises(ConflictError, match="undelivered"):
        order_service.change_status(db, order.id, "delivered")


def test_cannot_mark_delivered_with_balance_due(db):
    customer = make_customer(db)
    product = make_product(db)
    order = make_order(
        db, customer.id, lines=[{"product_id": product.id, "quantity": 10, "unit_price": 5.0}], status="shipped"
    )
    make_delivery_note(db, order.id, lines=[{"product_id": product.id, "quantity_delivered": 10}], status="issued")

    with pytest.raises(ConflictError, match="outstanding"):
        order_service.change_status(db, order.id, "delivered")


def test_can_mark_delivered_once_everything_is_settled(db):
    customer = make_customer(db)
    product = make_product(db)
    order = make_order(
        db, customer.id, lines=[{"product_id": product.id, "quantity": 10, "unit_price": 5.0}], status="shipped"
    )
    make_delivery_note(db, order.id, lines=[{"product_id": product.id, "quantity_delivered": 10}], status="issued")
    payment_service.create_payment(db, order.id, {"amount": 50, "payment_date": date(2026, 1, 1)})

    updated = order_service.change_status(db, order.id, "delivered")

    assert updated.status == "delivered"


def test_cancelling_confirmed_order_reports_released_reservations_and_cancelled_batches(db):
    customer = make_customer(db)
    product = make_product(db)
    order = make_order(
        db, customer.id, lines=[{"product_id": product.id, "quantity": 10, "unit_price": 5.0}], status="confirmed"
    )
    batch = make_production_schedule(db, product.id, 10, date(2026, 1, 1), date(2026, 1, 2), order_id=order.id)

    cancelled = order_service.change_status(db, order.id, "cancelled", reason="Customer backed out.")

    effects = cancelled.cancellation_effects
    assert effects is not None
    assert effects["released_reservations"] == [
        {"product_id": product.id, "product_name": product.name, "quantity": 10.0}
    ]
    assert effects["cancelled_delivery_notes"] == []
    assert [b["id"] for b in effects["cancelled_production_batches"]] == [batch.id]


def test_cancelling_shipped_order_reports_cancelled_delivery_notes_and_remainder_release(db):
    customer = make_customer(db)
    product = make_product(db)
    order = make_order(
        db, customer.id, lines=[{"product_id": product.id, "quantity": 10, "unit_price": 5.0}], status="shipped"
    )
    note = make_delivery_note(db, order.id, lines=[{"product_id": product.id, "quantity_delivered": 6}], status="issued")

    cancelled = order_service.change_status(db, order.id, "cancelled", reason="Customer refused delivery.")

    effects = cancelled.cancellation_effects
    assert effects["cancelled_delivery_notes"] == [{"id": note.id, "delivery_note_number": note.delivery_note_number}]
    # 6 already delivered (reversed via 'return' stock movement, not a
    # reservation release); the other 4 were never shipped, so that's the
    # only slice released here.
    assert effects["released_reservations"] == [
        {"product_id": product.id, "product_name": product.name, "quantity": 4.0}
    ]


def test_cancelling_draft_order_reports_no_effects(db):
    customer = make_customer(db)
    order = make_order(db, customer.id, status="draft")

    cancelled = order_service.change_status(db, order.id, "cancelled", reason="Never mind.")

    effects = cancelled.cancellation_effects
    assert effects == {
        "released_reservations": [],
        "cancelled_delivery_notes": [],
        "cancelled_production_batches": [],
    }


def test_resulting_unscheduled_quantity_after_cancelling_the_only_batch(db):
    customer = make_customer(db)
    product = make_product(db)
    order = make_order(
        db, customer.id, lines=[{"product_id": product.id, "quantity": 10, "unit_price": 5.0}], status="confirmed"
    )
    batch = make_production_schedule(db, product.id, 10, date(2026, 1, 1), date(2026, 1, 2), order_id=order.id)

    cancelled_batch = production_service.change_status(db, batch.id, "cancelled", reason="Machine breakdown.")

    assert production_service.get_resulting_unscheduled_quantity(db, cancelled_batch) == 10.0


def test_resulting_unscheduled_quantity_nets_against_other_scheduled_batches(db):
    customer = make_customer(db)
    product = make_product(db)
    order = make_order(
        db, customer.id, lines=[{"product_id": product.id, "quantity": 10, "unit_price": 5.0}], status="confirmed"
    )
    batch1 = make_production_schedule(db, product.id, 6, date(2026, 1, 1), date(2026, 1, 2), order_id=order.id)
    make_production_schedule(db, product.id, 4, date(2026, 1, 1), date(2026, 1, 2), order_id=order.id)

    cancelled_batch = production_service.change_status(db, batch1.id, "cancelled", reason="Machine breakdown.")

    # Only the surviving batch's 4 units still cover the order's 10 --
    # the other 6 (this batch's own share) are now unscheduled.
    assert production_service.get_resulting_unscheduled_quantity(db, cancelled_batch) == 6.0


def test_resulting_unscheduled_quantity_none_once_order_no_longer_active(db):
    customer = make_customer(db)
    product = make_product(db)
    order = make_order(
        db, customer.id, lines=[{"product_id": product.id, "quantity": 10, "unit_price": 5.0}], status="confirmed"
    )
    batch = make_production_schedule(db, product.id, 10, date(2026, 1, 1), date(2026, 1, 2), order_id=order.id)
    order.status = "cancelled"
    db.flush()

    cancelled_batch = production_service.change_status(db, batch.id, "cancelled", reason="Order was cancelled.")

    assert production_service.get_resulting_unscheduled_quantity(db, cancelled_batch) is None


def test_resulting_unscheduled_quantity_none_for_a_batch_with_no_order(db):
    product = make_product(db)
    batch = make_production_schedule(db, product.id, 10, date(2026, 1, 1), date(2026, 1, 2))

    cancelled_batch = production_service.change_status(db, batch.id, "cancelled", reason="No longer needed.")

    assert production_service.get_resulting_unscheduled_quantity(db, cancelled_batch) is None
