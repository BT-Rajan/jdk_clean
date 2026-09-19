"""Order-product quantity summary (ordered/scheduled/produced/remaining)
and the guard against scheduling more against an order line than it
still needs -- both new in this pass. See production_service.
get_order_product_quantity_summary and _assert_no_duplicate_scheduling.
"""

from datetime import date, timedelta

import pytest

from app.core.exceptions import ConflictError
from app.services import production_service

from .factories import make_customer, make_order, make_product


def _future_date():
    return date.today() + timedelta(days=14)


def test_summary_with_no_batches_yet(db):
    customer = make_customer(db)
    product = make_product(db)
    order = make_order(
        db, customer.id, lines=[{"product_id": product.id, "quantity": 10, "unit_price": 5.0}], status="confirmed"
    )

    summary = production_service.get_order_product_quantity_summary(db, order.id, product.id)

    assert summary == {"ordered": 10.0, "scheduled": 0.0, "produced": 0.0, "remaining": 10.0}


def test_create_batch_allows_exactly_the_remaining_quantity(db):
    customer = make_customer(db)
    product = make_product(db)
    order = make_order(
        db, customer.id, lines=[{"product_id": product.id, "quantity": 10, "unit_price": 5.0}], status="confirmed"
    )
    start = _future_date()

    batch = production_service.create_batch(
        db,
        {
            "product_id": product.id,
            "order_id": order.id,
            "planned_quantity": 10,
            "scheduled_start": start,
            "scheduled_end": start,
        },
    )

    assert batch.planned_quantity == 10
    summary = production_service.get_order_product_quantity_summary(db, order.id, product.id)
    assert summary == {"ordered": 10.0, "scheduled": 10.0, "produced": 0.0, "remaining": 0.0}


def test_create_batch_rejects_exceeding_the_remaining_quantity(db):
    customer = make_customer(db)
    product = make_product(db)
    order = make_order(
        db, customer.id, lines=[{"product_id": product.id, "quantity": 10, "unit_price": 5.0}], status="confirmed"
    )
    start = _future_date()

    with pytest.raises(ConflictError, match="over-schedule"):
        production_service.create_batch(
            db,
            {
                "product_id": product.id,
                "order_id": order.id,
                "planned_quantity": 15,
                "scheduled_start": start,
                "scheduled_end": start,
            },
        )


def test_a_second_batch_cannot_exceed_what_the_first_left_unsatisfied(db):
    customer = make_customer(db)
    product = make_product(db)
    order = make_order(
        db, customer.id, lines=[{"product_id": product.id, "quantity": 10, "unit_price": 5.0}], status="confirmed"
    )
    start = _future_date()
    production_service.create_batch(
        db,
        {
            "product_id": product.id,
            "order_id": order.id,
            "planned_quantity": 6,
            "scheduled_start": start,
            "scheduled_end": start,
        },
    )

    # Only 4 left (10 - 6 already scheduled) -- 5 would over-schedule it.
    with pytest.raises(ConflictError, match="over-schedule"):
        production_service.create_batch(
            db,
            {
                "product_id": product.id,
                "order_id": order.id,
                "planned_quantity": 5,
                "scheduled_start": start,
                "scheduled_end": start,
            },
        )

    # Exactly 4 is fine.
    second = production_service.create_batch(
        db,
        {
            "product_id": product.id,
            "order_id": order.id,
            "planned_quantity": 4,
            "scheduled_start": start,
            "scheduled_end": start,
        },
    )
    assert second.planned_quantity == 4


def test_update_batch_rejects_increasing_beyond_the_remaining_quantity(db):
    customer = make_customer(db)
    product = make_product(db)
    order = make_order(
        db, customer.id, lines=[{"product_id": product.id, "quantity": 10, "unit_price": 5.0}], status="confirmed"
    )
    start = _future_date()
    batch = production_service.create_batch(
        db,
        {
            "product_id": product.id,
            "order_id": order.id,
            "planned_quantity": 6,
            "scheduled_start": start,
            "scheduled_end": start,
        },
    )
    production_service.create_batch(
        db,
        {
            "product_id": product.id,
            "order_id": order.id,
            "planned_quantity": 4,
            "scheduled_start": start,
            "scheduled_end": start,
        },
    )

    # 6 + 4 already = 10 (fully scheduled) -- bumping the first batch to 7
    # would push the total to 11.
    with pytest.raises(ConflictError, match="over-schedule"):
        production_service.update_batch(db, batch.id, {"planned_quantity": 7})

    # Its own existing 6 is excluded from the check against itself, so
    # re-submitting the same quantity is always fine.
    unchanged = production_service.update_batch(db, batch.id, {"planned_quantity": 6})
    assert unchanged.planned_quantity == 6


def test_cancelled_batch_does_not_count_toward_scheduled_or_block_a_replacement(db):
    customer = make_customer(db)
    product = make_product(db)
    order = make_order(
        db, customer.id, lines=[{"product_id": product.id, "quantity": 10, "unit_price": 5.0}], status="confirmed"
    )
    start = _future_date()
    batch = production_service.create_batch(
        db,
        {
            "product_id": product.id,
            "order_id": order.id,
            "planned_quantity": 10,
            "scheduled_start": start,
            "scheduled_end": start,
        },
    )
    production_service.change_status(db, batch.id, "cancelled", reason="Machine breakdown.")

    summary = production_service.get_order_product_quantity_summary(db, order.id, product.id)
    assert summary == {"ordered": 10.0, "scheduled": 0.0, "produced": 0.0, "remaining": 10.0}

    # A full replacement batch is allowed -- the cancelled one no longer
    # counts against the line.
    replacement = production_service.create_batch(
        db,
        {
            "product_id": product.id,
            "order_id": order.id,
            "planned_quantity": 10,
            "scheduled_start": start,
            "scheduled_end": start,
        },
    )
    assert replacement.planned_quantity == 10


def test_unrelated_product_is_unaffected(db):
    """A batch tied to the same order but a different product entirely
    doesn't count against this product's own line."""
    customer = make_customer(db)
    product_a = make_product(db)
    product_b = make_product(db)
    order = make_order(
        db,
        customer.id,
        lines=[
            {"product_id": product_a.id, "quantity": 10, "unit_price": 5.0},
            {"product_id": product_b.id, "quantity": 20, "unit_price": 5.0},
        ],
        status="confirmed",
    )
    start = _future_date()
    production_service.create_batch(
        db,
        {
            "product_id": product_a.id,
            "order_id": order.id,
            "planned_quantity": 10,
            "scheduled_start": start,
            "scheduled_end": start,
        },
    )

    summary_b = production_service.get_order_product_quantity_summary(db, order.id, product_b.id)
    assert summary_b == {"ordered": 20.0, "scheduled": 0.0, "produced": 0.0, "remaining": 20.0}
