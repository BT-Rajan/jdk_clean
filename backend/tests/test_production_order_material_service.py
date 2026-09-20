"""Regression tests for production_order_material_service -- the P3
Material Requirement pass. Covers the UAT scenarios from the P3 spec:
normal calculation, quantity scaling, inventory comparison, idempotent
recalculation, and rejection when the product has no BOM.
"""

from datetime import date, datetime

import pytest

from app.core.exceptions import ConflictError, ValidationAppError
from app.services import (
    production_execution_service,
    production_order_material_service,
    production_order_schedule_service,
    production_order_service,
)

from .factories import (
    make_bom,
    make_bom_line,
    make_customer,
    make_machine,
    make_order,
    make_packaging_line,
    make_product,
    make_production_order,
    make_raw_material,
    set_stock,
)

DUE = date(2026, 2, 1)


def _order_and_line(db, quantity: float = 1000):
    customer = make_customer(db)
    product = make_product(db)
    order = make_order(
        db, customer.id, lines=[{"product_id": product.id, "quantity": quantity, "unit_price": 10}], status="confirmed"
    )
    return order, order.lines[0], product


def _planned_production_order(db, planned_quantity: float, order=None, line=None, product=None):
    if order is None:
        order, line, product = _order_and_line(db, planned_quantity * 2)
    return make_production_order(db, order.id, line.id, product.id, planned_quantity, DUE), product


def test_calculate_creates_requirement_rows_matching_bom(db):
    po, product = _planned_production_order(db, 500)
    cement = make_raw_material(db, unit="kg")
    sand = make_raw_material(db, unit="kg")
    make_bom(db, product.id, output_quantity=1)
    make_bom_line(db, product.id, "raw_material", cement.id, quantity=10, unit="kg")
    make_bom_line(db, product.id, "raw_material", sand.id, quantity=20, unit="kg")

    requirements = production_order_material_service.calculate(db, po.id)

    by_material = {r.raw_material_id: float(r.required_quantity) for r in requirements}
    assert by_material[cement.id] == 5000
    assert by_material[sand.id] == 10000
    assert all(r.source == "bom" for r in requirements)


def test_requirements_scale_with_planned_quantity(db):
    order, line, product = _order_and_line(db, 1000)
    cement = make_raw_material(db, unit="kg")
    make_bom(db, product.id, output_quantity=1)
    make_bom_line(db, product.id, "raw_material", cement.id, quantity=10, unit="kg")

    po_100, _ = _planned_production_order(db, 100, order=order, line=line, product=product)
    req_100 = production_order_material_service.calculate(db, po_100.id)
    assert float(req_100[0].required_quantity) == 1000

    po_200, _ = _planned_production_order(db, 200, order=order, line=line, product=product)
    req_200 = production_order_material_service.calculate(db, po_200.id)
    assert float(req_200[0].required_quantity) == 2000


def test_availability_shows_required_available_and_shortage(db):
    po, product = _planned_production_order(db, 500)
    cement = make_raw_material(db, unit="kg")
    sand = make_raw_material(db, unit="kg")
    make_bom(db, product.id, output_quantity=1)
    make_bom_line(db, product.id, "raw_material", cement.id, quantity=10, unit="kg")  # 5000 required
    make_bom_line(db, product.id, "raw_material", sand.id, quantity=20, unit="kg")  # 10000 required
    set_stock(db, cement.id, quantity_on_hand=4200)
    set_stock(db, sand.id, quantity_on_hand=20000)

    production_order_material_service.calculate(db, po.id)
    summary = production_order_material_service.get_requirement_summary(db, po.id)

    by_material = {item["raw_material_id"]: item for item in summary["items"]}
    assert by_material[cement.id]["required_quantity"] == 5000
    assert by_material[cement.id]["available_quantity"] == 4200
    assert by_material[cement.id]["shortage_quantity"] == 800
    assert by_material[sand.id]["shortage_quantity"] == 0
    assert summary["overall_status"] == "short"


def test_fully_covered_requirement_is_available(db):
    po, product = _planned_production_order(db, 100)
    cement = make_raw_material(db)
    make_bom(db, product.id, output_quantity=1)
    make_bom_line(db, product.id, "raw_material", cement.id, quantity=1, unit="kg")
    set_stock(db, cement.id, quantity_on_hand=1000)

    production_order_material_service.calculate(db, po.id)
    summary = production_order_material_service.get_requirement_summary(db, po.id)

    assert summary["overall_status"] == "available"


def test_summary_reports_not_calculated_before_first_run(db):
    po, product = _planned_production_order(db, 100)
    cement = make_raw_material(db)
    make_bom(db, product.id)
    make_bom_line(db, product.id, "raw_material", cement.id, quantity=1)

    summary = production_order_material_service.get_requirement_summary(db, po.id)

    assert summary["overall_status"] == "not_calculated"
    assert summary["items"] == []


def test_recalculation_does_not_duplicate_rows(db):
    po, product = _planned_production_order(db, 500)
    cement = make_raw_material(db)
    make_bom(db, product.id, output_quantity=1)
    make_bom_line(db, product.id, "raw_material", cement.id, quantity=10)

    production_order_material_service.calculate(db, po.id)
    production_order_material_service.calculate(db, po.id)
    production_order_material_service.calculate(db, po.id)

    requirements = production_order_material_service.get_requirements(db, po.id)
    assert len(requirements) == 1
    assert float(requirements[0].required_quantity) == 5000


def test_recalculation_reflects_bom_line_removal(db):
    po, product = _planned_production_order(db, 500)
    cement = make_raw_material(db)
    sand = make_raw_material(db)
    make_bom(db, product.id, output_quantity=1)
    make_bom_line(db, product.id, "raw_material", cement.id, quantity=10)
    sand_line = make_bom_line(db, product.id, "raw_material", sand.id, quantity=20)

    production_order_material_service.calculate(db, po.id)
    assert len(production_order_material_service.get_requirements(db, po.id)) == 2

    sand_line.deleted_at = datetime(2026, 1, 1)
    db.flush()
    production_order_material_service.calculate(db, po.id)

    requirements = production_order_material_service.get_requirements(db, po.id)
    assert len(requirements) == 1
    assert requirements[0].raw_material_id == cement.id


def test_packaging_included_as_separate_source(db):
    po, product = _planned_production_order(db, 500)
    cement = make_raw_material(db, material_type="raw_material")
    bag = make_raw_material(db, material_type="packaging")
    make_bom(db, product.id, output_quantity=1)
    make_bom_line(db, product.id, "raw_material", cement.id, quantity=10)
    make_packaging_line(db, product.id, bag.id, quantity_per_unit=1)

    requirements = production_order_material_service.calculate(db, po.id)

    by_material = {r.raw_material_id: r for r in requirements}
    assert by_material[cement.id].source == "bom"
    assert by_material[cement.id].bom_id is not None
    assert by_material[bag.id].source == "packaging"
    assert by_material[bag.id].bom_id is None
    assert float(by_material[bag.id].required_quantity) == 500

    summary = production_order_material_service.get_requirement_summary(db, po.id)
    labels = {item["raw_material_id"]: item["material_type_label"] for item in summary["items"]}
    assert labels[cement.id] == "Raw Material"
    assert labels[bag.id] == "Packaging Material"


def test_calculation_rejected_without_bom(db):
    po, product = _planned_production_order(db, 100)

    with pytest.raises(ValidationAppError):
        production_order_material_service.calculate(db, po.id)

    assert production_order_material_service.get_requirements(db, po.id) == []


def test_calculation_rejected_for_cancelled_production_order(db):
    po, product = _planned_production_order(db, 100)
    cement = make_raw_material(db)
    make_bom(db, product.id)
    make_bom_line(db, product.id, "raw_material", cement.id, quantity=1)
    production_order_service.change_status(db, po.id, "cancelled", reason="Test cancellation.")

    with pytest.raises(ConflictError):
        production_order_material_service.calculate(db, po.id)


def test_calculation_rejected_for_inactive_bom(db):
    po, product = _planned_production_order(db, 100)
    cement = make_raw_material(db)
    make_bom(db, product.id, status="inactive")
    make_bom_line(db, product.id, "raw_material", cement.id, quantity=1)

    with pytest.raises(ValidationAppError):
        production_order_material_service.calculate(db, po.id)


def test_recalculation_rejected_once_execution_has_started(db):
    # The Production Order's own status stays 'planned' throughout
    # scheduling/allocation/execution (only 'cancelled' exists as the
    # alternative), so that status guard alone doesn't stop a
    # recalculation from silently wiping requirement rows that real
    # consumption/allocation history has already been recorded against
    # -- calculate() must also check for a started execution directly.
    po, product = _planned_production_order(db, 100)
    cement = make_raw_material(db)
    make_bom(db, product.id, output_quantity=1)
    make_bom_line(db, product.id, "raw_material", cement.id, quantity=1)
    set_stock(db, cement.id, 1000)
    production_order_material_service.calculate(db, po.id)

    machine = make_machine(db)
    schedule = production_order_schedule_service.create_schedule(
        db,
        po.id,
        {"machine_id": machine.id, "planned_start": datetime(2026, 9, 25, 8, 0), "planned_end": datetime(2026, 9, 25, 20, 0)},
    )
    production_execution_service.start_execution(db, po.id, schedule.id)

    with pytest.raises(ConflictError, match="execution has started"):
        production_order_material_service.calculate(db, po.id)


def test_recalculation_still_allowed_before_execution_starts(db):
    po, product = _planned_production_order(db, 100)
    cement = make_raw_material(db)
    make_bom(db, product.id, output_quantity=1)
    make_bom_line(db, product.id, "raw_material", cement.id, quantity=1)
    production_order_material_service.calculate(db, po.id)

    machine = make_machine(db)
    production_order_schedule_service.create_schedule(
        db,
        po.id,
        {"machine_id": machine.id, "planned_start": datetime(2026, 9, 25, 8, 0), "planned_end": datetime(2026, 9, 25, 20, 0)},
    )

    requirements = production_order_material_service.calculate(db, po.id)
    assert len(requirements) == 1
