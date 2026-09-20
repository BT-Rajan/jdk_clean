"""Regression tests for P9 -- Delivery & end-to-end fulfilment hardening.

Covers what P8's own test files (test_delivery_note_service.py,
test_fg_fulfillment.py) don't already exercise: the atomic-commit fix
for issuing a delivery note (order status + stock deduction + the
note's own status write now land in one transaction, not two), the
stock movement referencing the specific delivery note rather than just
the order, duplicate-issue protection, and the full stock-driven
shortage -> production -> QC -> delivery -> fulfilled chain (P9 Test 3
and Test 14).
"""

from datetime import date, datetime
from unittest.mock import patch

import pytest

from app.core.exceptions import ConflictError
from app.services import (
    audit_service,
    delivery_note_service,
    inventory_service,
    order_service,
    production_execution_service,
    production_order_schedule_service,
    production_order_service,
    qc_service,
)

from .factories import make_customer, make_machine, make_order, make_product, make_qc_agent, set_product_stock

DUE = date(2026, 12, 1)


def _ready_order(db, quantity=10, on_hand=None, reserved=None):
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


def test_issued_stock_movement_references_the_specific_delivery_note(db):
    """P9 section 8/16: the stock movement an issued delivery note
    creates must be traceable to THAT note, not just the order it
    belongs to -- an order can have more than one."""
    order, product = _ready_order(db, quantity=10)
    note = delivery_note_service.create_delivery_note(db, {"order_id": order.id, "delivery_date": order.order_date})
    delivery_note_service.change_status(db, note.id, "issued")

    movements = inventory_service.get_movement_history(
        db, item_type="product", item_id=product.id, reference_type="delivery_note", reference_id=note.id
    )
    # Two movements now trace to this note: the physical issue, and the
    # reservation it releases (see inventory_service.release_reservation's
    # own movement logging) -- both real, traceable ledger entries.
    issue_movements = [m for m in movements["items"] if m.movement_type == "issue"]
    assert len(issue_movements) == 1
    assert issue_movements[0].quantity == -10


def test_double_issue_is_rejected_and_does_not_double_deduct(db):
    """P9 Test 9: repeated confirmation must not create a duplicate
    delivery or duplicate stock deduction."""
    order, product = _ready_order(db, quantity=10)
    note = delivery_note_service.create_delivery_note(db, {"order_id": order.id, "delivery_date": order.order_date})
    delivery_note_service.change_status(db, note.id, "issued")

    with pytest.raises(ConflictError):
        delivery_note_service.change_status(db, note.id, "issued")

    stock = inventory_service.get_stock(db, "product", product.id)
    assert stock["quantity_on_hand"] == 0  # not -10 -- no double deduction
    movements = inventory_service.get_movement_history(
        db, item_type="product", item_id=product.id, reference_type="delivery_note", reference_id=note.id
    )
    issue_movements = [m for m in movements["items"] if m.movement_type == "issue"]
    assert len(issue_movements) == 1


def test_issue_failure_before_final_commit_leaves_nothing_changed(db):
    """P9 section 9: delivery confirmation and inventory deduction must
    be atomic. Simulates a failure that happens after the order-side
    work (status change + stock deduction, done with commit=False) but
    before the delivery note's own status is written and the single
    combined commit fires -- the exact split-transaction window the P9
    fix closes. Nothing must have actually persisted: same rollback-on-
    exception behavior app.core.database.get_db provides for every real
    request.
    """
    order, product = _ready_order(db, quantity=10)
    note = delivery_note_service.create_delivery_note(db, {"order_id": order.id, "delivery_date": order.order_date})

    stock_before = inventory_service.get_stock(db, "product", product.id)
    order_status_before = order.status

    real_log_update = audit_service.log_update

    def flaky_log_update(db_arg, table_name, record_id, changes, user_id):
        if table_name == "delivery_notes":
            raise RuntimeError("simulated failure between the order-side write and the final commit")
        return real_log_update(db_arg, table_name, record_id, changes, user_id)

    with patch("app.services.audit_service.log_update", side_effect=flaky_log_update):
        with pytest.raises(RuntimeError):
            delivery_note_service.change_status(db, note.id, "issued")
    db.rollback()  # what app.core.database.get_db does for any unhandled exception

    reloaded_order = order_service.get_order(db, order.id)
    reloaded_note = delivery_note_service.get_delivery_note(db, note.id)
    stock_after = inventory_service.get_stock(db, "product", product.id)

    assert reloaded_order.status == order_status_before  # still 'ready_to_ship', not 'shipped'
    assert reloaded_note.status == "draft"  # never flipped to 'issued'
    assert stock_after == stock_before  # nothing deducted


def test_subsequent_production_completes_the_order(db):
    """P9 Test 3: order 1,500, initial FG 1,000, deliver 1,000. Later,
    500 is produced and QC-released, taking FG to 500 -- delivering the
    remaining 500 fully completes the order."""
    customer = make_customer(db)
    product = make_product(db)
    order = make_order(
        db, customer.id, lines=[{"product_id": product.id, "quantity": 1500, "unit_price": 10}], status="ready_to_ship"
    )
    set_product_stock(db, product.id, quantity_on_hand=1000, quantity_reserved=1500)

    note1 = delivery_note_service.create_delivery_note(db, {"order_id": order.id, "delivery_date": date(2026, 1, 1)})
    assert note1.lines[0].quantity_delivered == 1000
    delivery_note_service.change_status(db, note1.id, "issued")
    assert order_service.get_order(db, order.id).status == "shipped"
    assert inventory_service.get_stock(db, "product", product.id)["quantity_on_hand"] == 0

    # Later: 500 produced (stock-driven, no customer order involved) and
    # externally QC-released straight into FG.
    machine = make_machine(db)
    product.machine_id = machine.id
    product.production_hours_per_unit = 0.001
    db.flush()
    po = production_order_service.create_production_order(
        db, {"product_id": product.id, "planned_quantity": 500, "due_date": DUE}
    )
    schedule = production_order_schedule_service.create_schedule(
        db, po.id, {"machine_id": machine.id, "planned_start": datetime(2026, 9, 25, 8, 0), "planned_end": datetime(2026, 9, 25, 20, 0)}
    )
    execution = production_execution_service.start_execution(db, po.id, schedule.id, planned_quantity=500)
    execution = production_execution_service.complete_execution(db, execution.id, 500)
    agent = make_qc_agent(db)
    request = qc_service.create_request(
        db,
        {"production_order_id": po.id, "production_execution_id": execution.id, "qc_agent_id": agent.id},
    )
    qc_service.mark_sample_sent(db, request.id, None, None)
    qc_service.record_report(db, request.id, "LAB-1", date(2026, 9, 26), None, result="accepted")
    assert inventory_service.get_stock(db, "product", product.id)["quantity_on_hand"] == 500

    note2 = delivery_note_service.create_delivery_note(db, {"order_id": order.id, "delivery_date": date(2026, 1, 2)})
    assert note2.lines[0].quantity_delivered == 500
    delivery_note_service.change_status(db, note2.id, "issued")

    final_order = order_service.get_order(db, order.id)
    assert final_order.status == "delivered"
    assert inventory_service.get_stock(db, "product", product.id)["quantity_on_hand"] == 0


def test_end_to_end_shortage_to_fulfillment(db):
    """P9 Test 14: order 1,000, FG 300 -- 300 fulfillable now, 700
    shortage. Stock-driven production (no customer-order relationship)
    covers the 700, QC releases it, and the order reaches its fulfilled
    state -- with no quantity double-counted at any stage."""
    customer = make_customer(db)
    machine = make_machine(db)
    product = make_product(db, machine_id=machine.id, production_hours_per_unit=0.001)
    order = make_order(
        db, customer.id, lines=[{"product_id": product.id, "quantity": 1000, "unit_price": 10}], status="confirmed"
    )
    set_product_stock(db, product.id, quantity_on_hand=300, quantity_reserved=1000)

    line = order_service.get_fulfillment(db, order.id)[0]
    assert line["fulfillable_now"] == 300
    assert line["shortage"] == 700

    # Production planning addresses the shortage -- a stock production
    # order, no customer-order relationship required (P9 section 1/7).
    po = production_order_service.create_production_order(
        db, {"product_id": product.id, "planned_quantity": 700, "due_date": DUE}
    )
    assert po.order_id is None

    # Fulfilment already sees the 700 as planned, not as available FG --
    # no quantity confusion between "in the pipeline" and "on the shelf".
    line = order_service.get_fulfillment(db, order.id)[0]
    assert line["available_fg"] == 300
    assert line["planned_production_quantity"] == 700

    schedule = production_order_schedule_service.create_schedule(
        db, po.id, {"machine_id": machine.id, "planned_start": datetime(2026, 9, 25, 8, 0), "planned_end": datetime(2026, 9, 25, 20, 0)}
    )
    execution = production_execution_service.start_execution(db, po.id, schedule.id, planned_quantity=700)
    execution = production_execution_service.complete_execution(db, execution.id, 700)
    agent = make_qc_agent(db)
    request = qc_service.create_request(
        db,
        {"production_order_id": po.id, "production_execution_id": execution.id, "qc_agent_id": agent.id},
    )
    qc_service.mark_sample_sent(db, request.id, None, None)
    qc_service.record_report(db, request.id, "LAB-1", date(2026, 9, 26), None, result="accepted")

    line = order_service.get_fulfillment(db, order.id)[0]
    assert line["available_fg"] == 1000
    assert line["fulfillable_now"] == 1000
    assert line["shortage"] == 0

    order_service.change_status(db, order.id, "ready_to_ship")
    # Reaching 'ready_to_ship' auto-drafts a delivery note (Settings ->
    # Delivery) -- reuse it rather than creating a second one, which
    # would find the order already fully covered.
    notes = delivery_note_service.list_delivery_notes(db, order_id=order.id, page_size=10)
    note = notes["items"][0]
    assert note.lines[0].quantity_delivered == 1000
    delivery_note_service.change_status(db, note.id, "issued")

    final_order = order_service.get_order(db, order.id)
    assert final_order.status == "delivered"
    assert inventory_service.get_stock(db, "product", product.id)["quantity_on_hand"] == 0
