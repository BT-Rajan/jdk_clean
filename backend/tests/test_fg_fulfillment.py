"""Regression tests for P8 -- finished-goods inventory & order
fulfilment. Covers the UAT scenarios from the P8 spec that P7's own
test_qc_service.py doesn't already exercise: partial QC accept/reject
splitting one execution's output, stock-only Production Orders (no
customer order behind them), Customer Order fulfilment against released
FG stock (sufficient/insufficient, existing pipeline netting), multiple
orders sharing the same stock, and delivery-time protections against
QC-pending/rejected/insufficient stock.

Full-release, QC-pending, duplicate-release-idempotency, and
independent-multi-execution-status scenarios (P8 Tests 1/2/9) are
already covered by test_qc_service.py and are not duplicated here.
"""

from datetime import date, datetime

import pytest
from pydantic import ValidationError

from app.core.exceptions import AppError, ValidationAppError
from app.schemas.production_order import ProductionOrderCreate
from app.services import (
    delivery_note_service,
    inventory_service,
    order_service,
    production_execution_service,
    production_order_schedule_service,
    production_order_service,
    qc_service,
)

from .factories import (
    make_customer,
    make_machine,
    make_order,
    make_product,
    make_qc_agent,
    set_product_stock,
)

DUE = date(2026, 12, 1)


def _stock_execution(db, quantity: float = 1000, machine=None, product=None):
    """A completed Production Execution with no customer order behind
    it at all -- P8's stock-driven model, produced against expected
    demand rather than a specific order."""
    machine = machine or make_machine(db)
    product = product or make_product(db, machine_id=machine.id, production_hours_per_unit=0.001)
    po = production_order_service.create_production_order(
        db, {"product_id": product.id, "planned_quantity": quantity, "due_date": DUE}
    )
    schedule = production_order_schedule_service.create_schedule(
        db,
        po.id,
        {"machine_id": machine.id, "planned_start": datetime(2026, 9, 25, 8, 0), "planned_end": datetime(2026, 9, 25, 20, 0)},
    )
    execution = production_execution_service.start_execution(db, po.id, schedule.id, planned_quantity=quantity)
    execution = production_execution_service.complete_execution(db, execution.id, quantity)
    return po, execution, product


def _qc_request(db, po, execution, agent=None, **overrides):
    agent = agent or make_qc_agent(db)
    data = {
        "production_order_id": po.id,
        "production_execution_id": execution.id,
        "qc_agent_id": agent.id,
        "quantity": overrides.pop("quantity", None),
        "notes": overrides.pop("notes", None),
    }
    return qc_service.create_request(db, data), agent


# ---------------------------------------------------------------------
# Test 3: Partial QC release splits one execution's output.
# ---------------------------------------------------------------------


def test_partial_qc_release_splits_one_executions_output(db):
    po, execution, product = _stock_execution(db, quantity=1000)
    agent = make_qc_agent(db)

    accepted, _ = _qc_request(db, po, execution, agent=agent, quantity=700)
    qc_service.mark_sample_sent(db, accepted.id, None, None)
    qc_service.record_report(db, accepted.id, "LAB-A", date(2026, 9, 26), None, result="accepted")

    rejected, _ = _qc_request(db, po, execution, agent=agent, quantity=300)
    qc_service.mark_sample_sent(db, rejected.id, None, None)
    qc_service.record_report(db, rejected.id, "LAB-B", date(2026, 9, 27), None, result="rejected")

    stock = inventory_service.get_stock(db, "product", product.id)
    assert stock["quantity_on_hand"] == 700

    quantities = qc_service.get_qc_quantities(db, po.id)
    assert quantities == {"produced": 1000, "released": 700, "rejected": 300, "pending": 0}

    statuses = qc_service.get_fg_release_statuses(db, po.id)
    assert statuses[execution.id] == "partially_released"


def test_qc_request_quantity_cannot_exceed_undecided_remainder(db):
    po, execution, _ = _stock_execution(db, quantity=1000)
    agent = make_qc_agent(db)
    accepted, _ = _qc_request(db, po, execution, agent=agent, quantity=700)
    qc_service.mark_sample_sent(db, accepted.id, None, None)
    qc_service.record_report(db, accepted.id, "LAB-A", date(2026, 9, 26), None, result="accepted")

    # Only 300 is left undecided -- asking for more is rejected outright.
    with pytest.raises(ValidationAppError):
        qc_service.create_request(
            db,
            {
                "production_order_id": po.id,
                "production_execution_id": execution.id,
                "qc_agent_id": agent.id,
                "quantity": 301,
            },
        )

    # Deciding exactly what's left, then trying for more once nothing
    # remains undecided at all.
    qc_service.create_request(
        db,
        {
            "production_order_id": po.id,
            "production_execution_id": execution.id,
            "qc_agent_id": agent.id,
            "quantity": 300,
        },
    )
    with pytest.raises(ValidationAppError):
        qc_service.create_request(
            db,
            {
                "production_order_id": po.id,
                "production_execution_id": execution.id,
                "qc_agent_id": agent.id,
                "quantity": 1,
            },
        )


# ---------------------------------------------------------------------
# Test 6: Stock production -- no customer order required.
# ---------------------------------------------------------------------


def test_stock_production_order_has_no_customer_order(db):
    machine = make_machine(db)
    product = make_product(db, machine_id=machine.id, production_hours_per_unit=0.001)

    po = production_order_service.create_production_order(
        db, {"product_id": product.id, "planned_quantity": 1000, "due_date": DUE}
    )

    assert po.order_id is None
    assert po.order_detail_id is None
    assert po.product_id == product.id
    assert po.status == "planned"


def test_production_order_create_requires_exactly_one_target(db):
    customer = make_customer(db)
    product = make_product(db)
    order = make_order(
        db, customer.id, lines=[{"product_id": product.id, "quantity": 10, "unit_price": 5}], status="confirmed"
    )

    with pytest.raises(ValidationError):
        ProductionOrderCreate(planned_quantity=10, due_date=DUE)  # neither given

    with pytest.raises(ValidationError):
        ProductionOrderCreate(
            order_detail_id=order.lines[0].id, product_id=product.id, planned_quantity=10, due_date=DUE
        )  # both given


def test_stock_production_end_to_end_becomes_ordinary_fg_stock(db):
    """P8 Test 6: produce 1,000 units with no Customer Order, QC releases
    1,000 -- it becomes normal FG inventory, no customer relationship
    required anywhere in the chain."""
    po, execution, product = _stock_execution(db, quantity=1000)
    agent = make_qc_agent(db)
    request, _ = _qc_request(db, po, execution, agent=agent)
    qc_service.mark_sample_sent(db, request.id, None, None)

    qc_service.record_report(db, request.id, "LAB-STOCK", date(2026, 9, 26), None, result="accepted")

    stock = inventory_service.get_stock(db, "product", product.id)
    assert stock["quantity_on_hand"] == 1000

    reloaded_po = production_order_service.get_production_order(db, po.id)
    assert reloaded_po.order_id is None
    reloaded_execution = production_execution_service.get_execution(db, execution.id)
    assert reloaded_execution.production_order_id == po.id

    # That same stock is now free for ANY customer order to consume --
    # no reservation or ownership tying it back to this Production Order.
    customer = make_customer(db)
    order = make_order(
        db, customer.id, lines=[{"product_id": product.id, "quantity": 400, "unit_price": 10}], status="confirmed"
    )
    line = order_service.get_fulfillment(db, order.id)[0]
    assert line["available_fg"] == 1000
    assert line["fulfillable_now"] == 400
    assert line["shortage"] == 0


# ---------------------------------------------------------------------
# Tests 4/5/10/11: Customer Order fulfilment against released FG stock.
# ---------------------------------------------------------------------


def _confirmed_order_with_stock(db, ordered, on_hand, reserved=None):
    customer = make_customer(db)
    product = make_product(db)
    order = make_order(
        db, customer.id, lines=[{"product_id": product.id, "quantity": ordered, "unit_price": 10}], status="confirmed"
    )
    set_product_stock(db, product.id, quantity_on_hand=on_hand, quantity_reserved=ordered if reserved is None else reserved)
    return order, product


def _ready_order_with_stock(db, ordered, on_hand, reserved=None):
    """Same as _confirmed_order_with_stock, but born straight at
    'ready_to_ship' -- bypasses order_service's own confirm/production
    transitions (and their auto-create-delivery-note/auto-schedule
    hooks) entirely, same convention test_delivery_note_service.py's own
    _ready_order helper uses, so this file's delivery-focused tests
    create their own delivery note explicitly instead of fighting an
    auto-created one."""
    customer = make_customer(db)
    product = make_product(db)
    order = make_order(
        db,
        customer.id,
        lines=[{"product_id": product.id, "quantity": ordered, "unit_price": 10}],
        status="ready_to_ship",
    )
    set_product_stock(db, product.id, quantity_on_hand=on_hand, quantity_reserved=ordered if reserved is None else reserved)
    return order, product


def test_fulfillment_with_sufficient_stock(db):
    """P8 Test 4: order 1,000, released FG 1,500 -- 1,000 fulfillable,
    no production requirement generated."""
    order, product = _confirmed_order_with_stock(db, ordered=1000, on_hand=1500)

    lines = order_service.get_fulfillment(db, order.id)
    assert len(lines) == 1
    line = lines[0]
    assert line["product_id"] == product.id
    assert line["ordered_quantity"] == 1000
    assert line["delivered_quantity"] == 0
    assert line["remaining_quantity"] == 1000
    assert line["available_fg"] == 1500
    assert line["fulfillable_now"] == 1000
    assert line["shortage"] == 0
    assert line["planned_production_quantity"] == 0
    assert line["in_progress_production_quantity"] == 0


def test_fulfillment_with_shortage(db):
    """P8 Test 5: order 1,000, released FG 600 -- 600 fulfillable now,
    400 shortage visible, no automatic duplicate Production Order."""
    order, product = _confirmed_order_with_stock(db, ordered=1000, on_hand=600)

    line = order_service.get_fulfillment(db, order.id)[0]
    assert line["fulfillable_now"] == 600
    assert line["shortage"] == 400
    # Nothing auto-created just from asking for the fulfilment view.
    assert production_order_service.list_production_orders(db, product_id=product.id)["total"] == 0


def test_existing_planned_production_nets_the_shortage_without_being_available_fg(db):
    """P8 Test 5/10/11: order 1,000, released FG 300, 700 already
    planned -- shortage still shows 400... no wait, the existing
    pipeline (700) covers exactly the remaining 700, so there is no
    *unplanned* shortfall left to flag, but the 700 must never be
    reported as available FG either."""
    machine = make_machine(db)
    product = make_product(db, machine_id=machine.id, production_hours_per_unit=0.001)
    customer = make_customer(db)
    order = make_order(
        db, customer.id, lines=[{"product_id": product.id, "quantity": 1000, "unit_price": 10}], status="confirmed"
    )
    set_product_stock(db, product.id, quantity_on_hand=300, quantity_reserved=1000)
    production_order_service.create_production_order(
        db, {"product_id": product.id, "planned_quantity": 700, "due_date": DUE}
    )

    line = order_service.get_fulfillment(db, order.id)[0]
    assert line["available_fg"] == 300  # the 700 planned is never counted as available
    assert line["fulfillable_now"] == 300
    assert line["shortage"] == 700
    assert line["planned_production_quantity"] == 700
    assert line["in_progress_production_quantity"] == 0


def test_pipeline_quantity_splits_planned_and_in_progress(db):
    machine = make_machine(db)
    product = make_product(db, machine_id=machine.id, production_hours_per_unit=0.001)
    po = production_order_service.create_production_order(
        db, {"product_id": product.id, "planned_quantity": 1000, "due_date": DUE}
    )
    schedule = production_order_schedule_service.create_schedule(
        db,
        po.id,
        {
            "machine_id": machine.id,
            "planned_quantity": 400,
            "planned_start": datetime(2026, 9, 25, 8, 0),
            "planned_end": datetime(2026, 9, 25, 20, 0),
        },
    )
    production_execution_service.start_execution(db, po.id, schedule.id, planned_quantity=400)

    pipeline = production_order_service.get_pipeline_quantity(db, product.id)
    assert pipeline == {"planned_quantity": 600, "in_progress_quantity": 400}


def test_order_becomes_delivered_once_fully_shipped_from_stock(db):
    order, product = _ready_order_with_stock(db, ordered=600, on_hand=1000)

    note = delivery_note_service.create_delivery_note(db, {"order_id": order.id, "delivery_date": date(2026, 1, 1)})
    delivery_note_service.change_status(db, note.id, "issued")

    updated = order_service.get_order(db, order.id)
    assert updated.status == "delivered"
    stock = inventory_service.get_stock(db, "product", product.id)
    assert stock["quantity_on_hand"] == 400  # P8 Test 4: 1000 - 600 delivered


# ---------------------------------------------------------------------
# Test 7: Multiple orders sharing the same released FG stock.
# ---------------------------------------------------------------------


def test_multiple_orders_cannot_jointly_over_deliver_shared_stock(db):
    customer = make_customer(db)
    product = make_product(db)
    order_a = make_order(
        db, customer.id, lines=[{"product_id": product.id, "quantity": 600, "unit_price": 10}], status="ready_to_ship"
    )
    order_b = make_order(
        db, customer.id, lines=[{"product_id": product.id, "quantity": 500, "unit_price": 10}], status="ready_to_ship"
    )
    # Both orders' full quantities already reserved at their own confirm
    # time (permissive by design -- see order_service.change_status) --
    # together they exceed the 1,000 actually on the shelf.
    set_product_stock(db, product.id, quantity_on_hand=1000, quantity_reserved=1100)

    note_a = delivery_note_service.create_delivery_note(db, {"order_id": order_a.id, "delivery_date": date(2026, 1, 1)})
    delivery_note_service.change_status(db, note_a.id, "issued")
    assert inventory_service.get_stock(db, "product", product.id)["quantity_on_hand"] == 400

    # Order B's own 500 units can't all come from the 400 left -- the
    # existing adjust_stock guard blocks it outright (first-come-first-
    # served), so total delivered can never exceed what physically
    # existed, without any new allocation engine.
    note_b = delivery_note_service.create_delivery_note(db, {"order_id": order_b.id, "delivery_date": date(2026, 1, 1)})
    with pytest.raises(AppError):
        delivery_note_service.change_status(db, note_b.id, "issued")
    assert inventory_service.get_stock(db, "product", product.id)["quantity_on_hand"] == 400  # nothing moved


# ---------------------------------------------------------------------
# Test 10: Delivery protections.
# ---------------------------------------------------------------------


def test_cannot_deliver_qc_pending_stock(db):
    customer = make_customer(db)
    machine = make_machine(db)
    product = make_product(db, machine_id=machine.id, production_hours_per_unit=0.001)
    order = make_order(
        db, customer.id, lines=[{"product_id": product.id, "quantity": 500, "unit_price": 10}], status="ready_to_ship"
    )
    # Produced but never QC-released -- still zero on hand.
    _stock_execution(db, quantity=500, machine=machine, product=product)

    note = delivery_note_service.create_delivery_note(db, {"order_id": order.id, "delivery_date": date(2026, 1, 1)})
    with pytest.raises(AppError):
        delivery_note_service.change_status(db, note.id, "issued")


def test_cannot_deliver_rejected_stock(db):
    customer = make_customer(db)
    machine = make_machine(db)
    product = make_product(db, machine_id=machine.id, production_hours_per_unit=0.001)
    order = make_order(
        db, customer.id, lines=[{"product_id": product.id, "quantity": 500, "unit_price": 10}], status="ready_to_ship"
    )
    po, execution, _ = _stock_execution(db, quantity=500, machine=machine, product=product)
    request, _ = _qc_request(db, po, execution)
    qc_service.mark_sample_sent(db, request.id, None, None)
    qc_service.record_report(db, request.id, "LAB-REJ", date(2026, 9, 26), None, result="rejected")

    note = delivery_note_service.create_delivery_note(db, {"order_id": order.id, "delivery_date": date(2026, 1, 1)})
    with pytest.raises(AppError):
        delivery_note_service.change_status(db, note.id, "issued")


def test_cannot_deliver_more_than_available_stock(db):
    order, product = _ready_order_with_stock(db, ordered=1000, on_hand=600)

    note = delivery_note_service.create_delivery_note(db, {"order_id": order.id, "delivery_date": date(2026, 1, 1)})
    with pytest.raises(AppError):
        delivery_note_service.change_status(db, note.id, "issued")
    assert inventory_service.get_stock(db, "product", product.id)["quantity_on_hand"] == 600
