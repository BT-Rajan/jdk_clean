"""Regression tests for delivery_note_service, focused on multi-shipment
support -- an order can now be shipped across more than one delivery
note (multiple trucks/dates), which required delivery_note_service to
track how much of each order line is still outstanding rather than
assuming a single note always covers everything, and order_service to
release each shipment's own slice of the reservation instead of the
whole order's reservation on the first (and previously only) shipment.
"""

import pytest

from app.core.exceptions import ConflictError, ValidationAppError
from app.services import delivery_note_service, inventory_service, order_service

from .factories import make_customer, make_order, make_product, set_product_stock


def _ready_order(db, quantity=10, on_hand=None, reserved=None):
    """A confirmed-then-ready-to-ship order for one product, with
    finished-goods stock/reservation seeded to match what order_service's
    own confirm flow would have set up (reserved == ordered quantity)."""
    customer = make_customer(db)
    product = make_product(db)
    order = make_order(
        db, customer.id, lines=[{"product_id": product.id, "quantity": quantity, "unit_price": 10}],
        status="ready_to_ship",
    )
    set_product_stock(
        db, product.id,
        quantity_on_hand=on_hand if on_hand is not None else quantity,
        quantity_reserved=reserved if reserved is not None else quantity,
    )
    return order, product


def _stock(db, product_id):
    return inventory_service.get_stock(db, "product", product_id)


def test_single_shipment_covers_the_whole_order(db):
    order, product = _ready_order(db, quantity=10)

    note = delivery_note_service.create_delivery_note(
        db, {"order_id": order.id, "delivery_date": order.order_date}
    )
    assert note.lines[0].quantity_delivered == 10  # defaulted to the full order line

    issued = delivery_note_service.change_status(db, note.id, "issued")
    assert issued.status == "issued"

    updated_order = order_service.get_order(db, order.id)
    # P8 spec section 13: the whole order is covered by this one
    # shipment, so it goes straight to 'delivered' rather than sitting
    # at 'shipped' for someone to close out by hand.
    assert updated_order.status == "delivered"
    stock = _stock(db, product.id)
    assert stock["quantity_on_hand"] == 0
    assert stock["quantity_reserved"] == 0


def test_second_note_rejected_once_order_is_fully_covered(db):
    order, _product = _ready_order(db, quantity=10)
    note = delivery_note_service.create_delivery_note(
        db, {"order_id": order.id, "delivery_date": order.order_date}
    )
    delivery_note_service.change_status(db, note.id, "issued")

    with pytest.raises(ConflictError):
        delivery_note_service.create_delivery_note(db, {"order_id": order.id, "delivery_date": order.order_date})


def test_multi_shipment_across_two_notes_accounts_for_everything(db):
    order, product = _ready_order(db, quantity=10)
    on_hand_before = _stock(db, product.id)["quantity_on_hand"]
    reserved_before = _stock(db, product.id)["quantity_reserved"]

    first = delivery_note_service.create_delivery_note(
        db,
        {
            "order_id": order.id,
            "delivery_date": order.order_date,
            "lines": [{"product_id": product.id, "quantity_delivered": 6}],
        },
    )
    delivery_note_service.change_status(db, first.id, "issued")

    mid_order = order_service.get_order(db, order.id)
    assert mid_order.status == "shipped"  # first shipment already moves it
    mid_stock = _stock(db, product.id)
    assert mid_stock["quantity_on_hand"] == on_hand_before - 6
    assert mid_stock["quantity_reserved"] == reserved_before - 6

    # A second note can still be created against the same (already
    # 'shipped') order -- defaults to exactly what's left.
    second = delivery_note_service.create_delivery_note(
        db, {"order_id": order.id, "delivery_date": order.order_date}
    )
    assert second.lines[0].quantity_delivered == 4
    delivery_note_service.change_status(db, second.id, "issued")

    final_order = order_service.get_order(db, order.id)
    # P8 spec section 13: this second shipment covers what the first
    # one didn't, so the order is now fully delivered.
    assert final_order.status == "delivered"
    final_stock = _stock(db, product.id)
    assert final_stock["quantity_on_hand"] == on_hand_before - 10
    assert final_stock["quantity_reserved"] == reserved_before - 10


def test_note_line_exceeding_remaining_quantity_is_rejected(db):
    order, product = _ready_order(db, quantity=10)

    with pytest.raises(ValidationAppError):
        delivery_note_service.create_delivery_note(
            db,
            {
                "order_id": order.id,
                "delivery_date": order.order_date,
                "lines": [{"product_id": product.id, "quantity_delivered": 11}],
            },
        )


def test_editing_a_draft_note_beyond_remaining_is_rejected_but_within_it_succeeds(db):
    order, product = _ready_order(db, quantity=10)
    note = delivery_note_service.create_delivery_note(
        db,
        {
            "order_id": order.id,
            "delivery_date": order.order_date,
            "lines": [{"product_id": product.id, "quantity_delivered": 6}],
        },
    )

    # Editing its own line up to the full order quantity is fine -- this
    # note is the only thing claiming any of it right now.
    updated = delivery_note_service.update_delivery_note(
        db, note.id, {"lines": [{"product_id": product.id, "quantity_delivered": 10}]}
    )
    assert updated.lines[0].quantity_delivered == 10

    # But not beyond the order's own ordered quantity.
    with pytest.raises(ValidationAppError):
        delivery_note_service.update_delivery_note(
            db, note.id, {"lines": [{"product_id": product.id, "quantity_delivered": 11}]}
        )


def test_cancelling_order_after_partial_shipment_reverses_delivered_and_releases_rest(db):
    order, product = _ready_order(db, quantity=10)
    on_hand_before = _stock(db, product.id)["quantity_on_hand"]
    reserved_before = _stock(db, product.id)["quantity_reserved"]

    note = delivery_note_service.create_delivery_note(
        db,
        {
            "order_id": order.id,
            "delivery_date": order.order_date,
            "lines": [{"product_id": product.id, "quantity_delivered": 6}],
        },
    )
    delivery_note_service.change_status(db, note.id, "issued")

    order_service.change_status(db, order.id, "cancelled", reason="Customer refused the rest of the shipment")

    final_stock = _stock(db, product.id)
    # The 6 delivered come back onto the shelf (a 'return' movement); the
    # 4 that were reserved but never shipped are released, not left
    # dangling now that nothing more is coming.
    assert final_stock["quantity_on_hand"] == on_hand_before  # 6 issued, 6 returned -- net zero
    assert final_stock["quantity_reserved"] == reserved_before - 10
    # P9 section 14/15: the note's own record stays honest about the
    # reversal too -- it must never still read as a live 'issued'
    # shipment once the order that shipped it has been cancelled.
    reversed_note = delivery_note_service.get_delivery_note(db, note.id)
    assert reversed_note.status == "cancelled"
    assert "cancelled" in reversed_note.cancel_reason.lower()


def test_draft_note_still_counts_against_remaining_even_if_never_issued(db):
    """Two drafts shouldn't be able to each independently claim the same
    units -- only one can be created up to the order's line quantity."""
    order, product = _ready_order(db, quantity=10)
    delivery_note_service.create_delivery_note(
        db,
        {
            "order_id": order.id,
            "delivery_date": order.order_date,
            "lines": [{"product_id": product.id, "quantity_delivered": 10}],
        },
    )

    with pytest.raises(ConflictError):
        delivery_note_service.create_delivery_note(db, {"order_id": order.id, "delivery_date": order.order_date})
