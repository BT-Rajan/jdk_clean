"""P11 -- end-to-end UAT scenarios, exercised as literal, traceable
flows matching the P11 spec's own scenario numbering. Scenarios B, F and
G are already thoroughly covered (with different numbers) by
test_delivery_hardening.py's shortage-to-fulfillment tests, test_fg_
fulfillment.py's partial-QC-release tests, and test_delivery_note_
service.py's delivery lifecycle tests respectively -- not duplicated
here. This file adds the scenarios genuinely not yet covered end-to-end:
A (stock-driven factory, production before any customer order), C
(multiple customers sharing one FG pool), D (multiple executions under
one Production Order), and E (partial production completed later).
"""

from datetime import date, datetime

from app.services import (
    delivery_note_service,
    inventory_service,
    order_service,
    production_execution_service,
    production_order_material_service,
    production_order_schedule_service,
    production_order_service,
    qc_service,
)

from .factories import make_customer, make_machine, make_order, make_product, make_qc_agent

DUE = date(2026, 12, 1)


def _stock_production_order(db, product, machine, planned_quantity):
    """Production planned purely to build FG stock -- no customer order
    behind it (spec section 1: 'the factory is fundamentally stock-
    driven')."""
    return production_order_service.create_production_order(
        db, {"product_id": product.id, "planned_quantity": planned_quantity, "due_date": DUE}
    )


def _run_and_release(db, po, machine, quantity, start, agent, lab_ref, result="accepted"):
    """One schedule -> one execution -> one QC decision covering that
    execution's entire produced quantity."""
    schedule = production_order_schedule_service.create_schedule(
        db,
        po.id,
        {
            "machine_id": machine.id,
            "planned_quantity": quantity,
            "planned_start": start,
            "planned_end": start.replace(hour=20),
        },
    )
    execution = production_execution_service.start_execution(db, po.id, schedule.id, planned_quantity=quantity)
    execution = production_execution_service.complete_execution(db, execution.id, quantity)
    request = qc_service.create_request(
        db, {"production_order_id": po.id, "production_execution_id": execution.id, "qc_agent_id": agent.id}
    )
    qc_service.mark_sample_sent(db, request.id, None, None)
    qc_service.record_report(db, request.id, lab_ref, date(2026, 9, 26), None, result=result)
    return execution


def test_scenario_a_stock_driven_factory_full_chain(db):
    """Production -> Materials/Availability -> Execution -> External QC
    -> FG -> Customer Order (created AFTER stock exists) -> Delivery.
    Every quantity must reconcile at each step -- no customer order owns
    or triggers the production."""
    machine = make_machine(db)
    product = make_product(db, machine_id=machine.id, production_hours_per_unit=0.001)
    agent = make_qc_agent(db)

    # Step 1 -- plan production with no customer order at all.
    po = _stock_production_order(db, product, machine, 200)
    assert po.order_id is None

    # Step 2/3 -- no BOM/material requirement on this product, so nothing
    # to allocate; availability is trivially satisfied. (A materials-
    # heavy variant of this exact chain, including a purchase-driven
    # shortage, is covered by test_delivery_hardening.py's Test 3/14.)

    # Step 4 -- schedule and execute; verify actual produced quantity.
    execution = _run_and_release(
        db, po, machine, 200, datetime(2026, 9, 25, 8, 0), agent, "LAB-A", result="accepted"
    )
    assert execution.produced_quantity == 200

    # Step 5/6 -- QC accepted the full run; verify it reached FG.
    stock = inventory_service.get_stock(db, "product", product.id)
    assert stock["quantity_on_hand"] == 200

    # Step 7 -- customer order created only now, after stock exists.
    customer = make_customer(db)
    order = make_order(
        db, customer.id, lines=[{"product_id": product.id, "quantity": 150, "unit_price": 20}], status="confirmed"
    )
    line = order_service.get_fulfillment(db, order.id)[0]
    assert line["available_fg"] == 200
    assert line["fulfillable_now"] == 150
    assert line["shortage"] == 0

    order_service.change_status(db, order.id, "ready_to_ship")
    note = delivery_note_service.list_delivery_notes(db, order_id=order.id, page_size=10)["items"][0]
    assert note.lines[0].quantity_delivered == 150
    delivery_note_service.change_status(db, note.id, "issued")

    # Final verification -- trace Production -> QC -> FG -> Order -> Delivery.
    final_order = order_service.get_order(db, order.id)
    assert final_order.status == "delivered"
    final_stock = inventory_service.get_stock(db, "product", product.id)
    assert final_stock["quantity_on_hand"] == 50  # 200 produced - 150 delivered


def test_scenario_c_multiple_customers_share_one_fg_pool(db):
    """FG = 1,000. Customer A = 600, B = 300, C = 400 (total demand 1,300
    against 1,000 available) -- fulfilment must never let total committed
    stock exceed what's legitimately available, and production stays
    independent of any one customer."""
    machine = make_machine(db)
    product = make_product(db, machine_id=machine.id, production_hours_per_unit=0.001)
    agent = make_qc_agent(db)

    po = _stock_production_order(db, product, machine, 1000)
    _run_and_release(db, po, machine, 1000, datetime(2026, 9, 25, 8, 0), agent, "LAB-C")
    assert inventory_service.get_stock(db, "product", product.id)["quantity_on_hand"] == 1000

    customer_a = make_customer(db)
    customer_b = make_customer(db)
    customer_c = make_customer(db)
    order_a = make_order(db, customer_a.id, lines=[{"product_id": product.id, "quantity": 600, "unit_price": 20}], status="confirmed")
    order_b = make_order(db, customer_b.id, lines=[{"product_id": product.id, "quantity": 300, "unit_price": 20}], status="confirmed")
    order_c = make_order(db, customer_c.id, lines=[{"product_id": product.id, "quantity": 400, "unit_price": 20}], status="confirmed")

    # A and B ship first -- 900 of the 1,000 committed.
    order_service.change_status(db, order_a.id, "ready_to_ship")
    note_a = delivery_note_service.list_delivery_notes(db, order_id=order_a.id, page_size=10)["items"][0]
    assert note_a.lines[0].quantity_delivered == 600
    delivery_note_service.change_status(db, note_a.id, "issued")

    order_service.change_status(db, order_b.id, "ready_to_ship")
    note_b = delivery_note_service.list_delivery_notes(db, order_id=order_b.id, page_size=10)["items"][0]
    assert note_b.lines[0].quantity_delivered == 300
    delivery_note_service.change_status(db, note_b.id, "issued")

    # Only 100 of the 1,000 remains -- C's 400 can only be partially
    # fulfilled, never over-committed beyond what's actually on the shelf.
    line_c = order_service.get_fulfillment(db, order_c.id)[0]
    assert line_c["available_fg"] == 100
    assert line_c["fulfillable_now"] == 100
    assert line_c["shortage"] == 300

    stock = inventory_service.get_stock(db, "product", product.id)
    assert stock["quantity_on_hand"] == 100  # 1,000 - 600 - 300, never negative, never over-issued


def test_scenario_d_multiple_production_runs_reconcile(db):
    """Planned = 1,000 across three executions (400 + 350 + 250). Total
    produced, QC quantities, and FG released must all reconcile, with no
    duplicate receipt and correct overall Production Order progress."""
    machine = make_machine(db)
    product = make_product(db, machine_id=machine.id, production_hours_per_unit=0.001)
    agent = make_qc_agent(db)
    po = _stock_production_order(db, product, machine, 1000)

    _run_and_release(db, po, machine, 400, datetime(2026, 9, 25, 8, 0), agent, "LAB-D1")
    _run_and_release(db, po, machine, 350, datetime(2026, 9, 26, 8, 0), agent, "LAB-D2")
    _run_and_release(db, po, machine, 250, datetime(2026, 9, 27, 8, 0), agent, "LAB-D3")

    progress = production_execution_service.get_progress(db, po.id)
    assert progress["total_produced"] == 1000
    assert progress["remaining_to_produce"] == 0
    assert progress["execution_status"] == "completed"
    assert len(progress["runs"]) == 3

    quantities = qc_service.get_qc_quantities(db, po.id)
    assert quantities == {"produced": 1000, "released": 1000, "rejected": 0, "pending": 0}

    stock = inventory_service.get_stock(db, "product", product.id)
    assert stock["quantity_on_hand"] == 1000  # no duplicate receipt across the three runs

    movements = inventory_service.get_movement_history(db, item_type="product", item_id=product.id)
    assert movements["total"] == 3  # exactly one receipt per execution's QC release


def test_scenario_e_partial_production_then_completed_later(db):
    """Production Order = 1,000, actual first run = 700. Remaining
    production (300) must show correctly, with no false completion at
    1,000, QC applying only to what's actually been produced, and FG
    reflecting only the released portion -- then completing the
    remaining 300 later reconciles the totals."""
    machine = make_machine(db)
    product = make_product(db, machine_id=machine.id, production_hours_per_unit=0.001)
    agent = make_qc_agent(db)
    po = _stock_production_order(db, product, machine, 1000)

    execution_1 = _run_and_release(db, po, machine, 700, datetime(2026, 9, 25, 8, 0), agent, "LAB-E1")
    assert execution_1.produced_quantity == 700

    progress = production_execution_service.get_progress(db, po.id)
    assert progress["total_produced"] == 700
    assert progress["remaining_to_produce"] == 300
    assert progress["execution_status"] == "partially_completed"  # no false completion at 1,000

    stock = inventory_service.get_stock(db, "product", product.id)
    assert stock["quantity_on_hand"] == 700  # FG reflects only the released portion so far

    # Complete the remaining 300 later.
    _run_and_release(db, po, machine, 300, datetime(2026, 9, 26, 8, 0), agent, "LAB-E2")

    final_progress = production_execution_service.get_progress(db, po.id)
    assert final_progress["total_produced"] == 1000
    assert final_progress["remaining_to_produce"] == 0
    assert final_progress["execution_status"] == "completed"

    final_stock = inventory_service.get_stock(db, "product", product.id)
    assert final_stock["quantity_on_hand"] == 1000
