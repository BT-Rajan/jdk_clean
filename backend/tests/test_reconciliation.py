"""P10 -- Reconciliation & exception detection.

reconciliation_service.get_exceptions runs deterministic checks over
existing tables; every ordinary write path already prevents these
states, so each test here fabricates the bad state directly at the ORM
level (bypassing the service layer, the same way a historical data
issue or a future bug would slip past it) and verifies detection --
and, just as importantly, that nothing is silently corrected in the
process (no destructive/auto-fix behaviour, per spec section 16/17).
"""

from datetime import date, datetime

from app.models.inventory import StockMovement
from app.models.production_execution import ProductionExecution
from app.models.production_order_material import ProductionOrderMaterialRequirement
from app.services import (
    inventory_service,
    production_order_material_service,
    production_order_service,
    reconciliation_service,
)

from .factories import (
    make_bom,
    make_bom_line,
    make_customer,
    make_delivery_note,
    make_machine,
    make_order,
    make_product,
    make_production_order,
    make_production_schedule,
    make_raw_material,
    set_product_stock,
    set_stock,
)

DUE = date(2026, 12, 1)


def _kinds(exceptions):
    return {e["kind"] for e in exceptions}


def test_clean_system_has_no_exceptions(db):
    customer = make_customer(db)
    product = make_product(db)
    make_order(db, customer.id, lines=[{"product_id": product.id, "quantity": 10, "unit_price": 5}])
    assert reconciliation_service.get_exceptions(db) == []


def test_detects_production_overproduction(db):
    customer = make_customer(db)
    machine = make_machine(db)
    product = make_product(db, machine_id=machine.id, production_hours_per_unit=0.001)
    order = make_order(db, customer.id, lines=[{"product_id": product.id, "quantity": 100, "unit_price": 5}])
    po = make_production_order(db, order.id, order.lines[0].id, product.id, 100, DUE)
    schedule = make_production_schedule(
        db, product.id, 100, datetime(2026, 9, 25, 8, 0), datetime(2026, 9, 25, 20, 0), machine_id=machine.id
    )
    # Fabricated directly -- complete_execution's own guard is what
    # actually prevents this on every ordinary write.
    execution = ProductionExecution(
        production_order_id=po.id, schedule_id=schedule.id, product_id=product.id,
        planned_quantity=100, produced_quantity=150, status="completed", started_at=datetime(2026, 9, 25, 8, 0),
    )
    db.add(execution)
    db.flush()

    exceptions = reconciliation_service.get_exceptions(db)
    assert "overproduction" in _kinds(exceptions)
    match = next(e for e in exceptions if e["kind"] == "overproduction")
    assert match["expected"] == 100
    assert match["actual"] == 150
    assert match["difference"] == 50

    # Nothing was touched -- the PO and execution rows are exactly as fabricated.
    assert db.query(ProductionExecution).filter(ProductionExecution.id == execution.id).one().produced_quantity == 150


def _po_with_requirement(db, quantity=1000, bom_line_qty=1):
    customer = make_customer(db)
    product = make_product(db)
    order = make_order(
        db, customer.id, lines=[{"product_id": product.id, "quantity": quantity, "unit_price": 10}], status="confirmed"
    )
    material = make_raw_material(db)
    make_bom(db, product.id, output_quantity=1)
    make_bom_line(db, product.id, "raw_material", material.id, quantity=bom_line_qty)
    po = make_production_order(db, order.id, order.lines[0].id, product.id, quantity, DUE)
    production_order_material_service.calculate(db, po.id)
    requirement = production_order_material_service.get_requirements(db, po.id)[0]
    return po, requirement, material


def test_detects_material_over_consumption(db):
    po, requirement, material = _po_with_requirement(db, quantity=1000)
    set_stock(db, material.id, quantity_on_hand=5000)
    # Fabricated directly -- consume() itself always grows allocated_quantity
    # to at least cover what it consumes.
    db.query(ProductionOrderMaterialRequirement).filter(ProductionOrderMaterialRequirement.id == requirement.id).update(
        {"allocated_quantity": 100, "consumed_quantity": 300}
    )
    db.flush()

    exceptions = reconciliation_service.get_exceptions(db)
    match = next(e for e in exceptions if e["kind"] == "consumed_exceeds_allocated")
    assert match["expected"] == 100
    assert match["actual"] == 300


def test_does_not_flag_legitimate_bom_variance(db):
    """Test 7's own counterpart: consumed > required (BOM) is a
    legitimate, expected variance -- never an exception on its own, only
    consumed > allocated is (covered above)."""
    po, requirement, material = _po_with_requirement(db, quantity=1000, bom_line_qty=1)
    set_stock(db, material.id, quantity_on_hand=5000)
    production_order_material_service.allocate(db, po.id, requirement.id, 1000)
    db.query(ProductionOrderMaterialRequirement).filter(ProductionOrderMaterialRequirement.id == requirement.id).update(
        {"allocated_quantity": 1050, "consumed_quantity": 1050}
    )
    db.flush()

    exceptions = reconciliation_service.get_exceptions(db)
    assert _kinds(exceptions) == set()


def test_detects_cancelled_order_leftover_allocation(db):
    po, requirement, material = _po_with_requirement(db, quantity=1000)
    set_stock(db, material.id, quantity_on_hand=5000)
    production_order_material_service.allocate(db, po.id, requirement.id, 600)
    # Simulates data from before the P10 auto-release fix -- a
    # cancellation that never released its allocation. change_status
    # itself now prevents this on every ordinary write.
    po.status = "cancelled"
    po.cancel_reason = "Simulated pre-P10 cancellation."
    db.flush()

    exceptions = reconciliation_service.get_exceptions(db)
    match = next(e for e in exceptions if e["kind"] == "cancelled_order_leftover_allocation")
    assert match["actual"] == 600


def test_real_cancellation_flow_leaves_no_exception(db):
    """The actual P10 fix path (production_order_service.change_status)
    must not itself trip this same check."""
    po, requirement, material = _po_with_requirement(db, quantity=1000)
    set_stock(db, material.id, quantity_on_hand=5000)
    production_order_material_service.allocate(db, po.id, requirement.id, 600)
    production_order_service.change_status(db, po.id, "cancelled", reason="Test cancellation.")

    exceptions = reconciliation_service.get_exceptions(db)
    assert "cancelled_order_leftover_allocation" not in _kinds(exceptions)


def test_detects_qc_over_decision(db):
    customer = make_customer(db)
    machine = make_machine(db)
    product = make_product(db, machine_id=machine.id, production_hours_per_unit=0.001)
    order = make_order(db, customer.id, lines=[{"product_id": product.id, "quantity": 100, "unit_price": 5}])
    po = make_production_order(db, order.id, order.lines[0].id, product.id, 100, DUE)
    schedule = make_production_schedule(
        db, product.id, 100, datetime(2026, 9, 25, 8, 0), datetime(2026, 9, 25, 20, 0), machine_id=machine.id
    )
    # Fabricated directly -- qc_service's own partial accept/reject guards
    # keep released + rejected <= produced on every ordinary write.
    execution = ProductionExecution(
        production_order_id=po.id, schedule_id=schedule.id, product_id=product.id,
        planned_quantity=100, produced_quantity=100, released_quantity=80, rejected_quantity=50,
        status="completed", started_at=datetime(2026, 9, 25, 8, 0),
    )
    db.add(execution)
    db.flush()

    exceptions = reconciliation_service.get_exceptions(db)
    match = next(e for e in exceptions if e["kind"] == "qc_exceeds_produced")
    assert match["expected"] == 100
    assert match["actual"] == 130


def test_detects_order_over_delivery(db):
    customer = make_customer(db)
    product = make_product(db)
    order = make_order(db, customer.id, lines=[{"product_id": product.id, "quantity": 10, "unit_price": 5}])
    set_product_stock(db, product.id, quantity_on_hand=50)
    # Fabricated directly -- delivery_note_service's own stock/quantity
    # validation is what prevents over-delivery on every ordinary write.
    make_delivery_note(
        db, order.id, lines=[{"product_id": product.id, "quantity_delivered": 15}], status="issued"
    )

    exceptions = reconciliation_service.get_exceptions(db)
    match = next(e for e in exceptions if e["kind"] == "over_delivered")
    assert match["expected"] == 10
    assert match["actual"] == 15


def test_detects_delivery_without_inventory_movement(db):
    customer = make_customer(db)
    product = make_product(db)
    order = make_order(db, customer.id, lines=[{"product_id": product.id, "quantity": 10, "unit_price": 5}])
    set_product_stock(db, product.id, quantity_on_hand=50)
    # Fabricated directly -- delivery_note_service.change_status's atomic
    # issue path always creates the matching movement on every ordinary write.
    make_delivery_note(
        db, order.id, lines=[{"product_id": product.id, "quantity_delivered": 10}], status="issued"
    )

    exceptions = reconciliation_service.get_exceptions(db)
    match = next(e for e in exceptions if e["kind"] == "delivery_without_inventory_movement")
    assert match["expected"] == 10
    assert match["actual"] == 0


def test_detects_duplicate_inventory_transaction(db):
    customer = make_customer(db)
    product = make_product(db)
    order = make_order(db, customer.id, lines=[{"product_id": product.id, "quantity": 10, "unit_price": 5}])
    set_product_stock(db, product.id, quantity_on_hand=50)
    note = make_delivery_note(
        db, order.id, lines=[{"product_id": product.id, "quantity_delivered": 10}], status="issued"
    )
    # Fabricated directly -- delivery_note_service's duplicate-issue
    # protection (P9 Test 9) is what prevents this on every ordinary write.
    inventory_service.adjust_stock(
        db, item_type="product", item_id=product.id, quantity=-10, movement_type="issue",
        reference_type="delivery_note", reference_id=note.id,
    )
    inventory_service.adjust_stock(
        db, item_type="product", item_id=product.id, quantity=-10, movement_type="issue",
        reference_type="delivery_note", reference_id=note.id,
    )

    exceptions = reconciliation_service.get_exceptions(db)
    match = next(e for e in exceptions if e["kind"] == "duplicate_inventory_transaction")
    assert match["actual"] == 2
