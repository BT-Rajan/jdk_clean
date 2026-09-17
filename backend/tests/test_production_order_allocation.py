"""Regression tests for production_order_material_service's P4
allocation/release -- the UAT scenarios from the P4 spec: full
allocation, partial allocation, cross-order double-allocation
prevention, release, repeated-request safety, and cancelled-order
rejection.
"""

from datetime import date

import pytest

from app.core.exceptions import ConflictError, ValidationAppError
from app.services import inventory_service, production_order_material_service, production_order_service

from .factories import (
    make_bom,
    make_bom_line,
    make_customer,
    make_order,
    make_product,
    make_production_order,
    make_raw_material,
    set_stock,
)

DUE = date(2026, 2, 1)


def _po_with_requirement(db, quantity: float = 1000, bom_line_qty: float = 1):
    """One Production Order, planned, with a single-material BOM
    requirement calculated (required_quantity == quantity * bom_line_qty)."""
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


def test_full_allocation(db):
    po, requirement, material = _po_with_requirement(db, quantity=1000)
    set_stock(db, material.id, quantity_on_hand=1500)

    summary = production_order_material_service.allocate(db, po.id, requirement.id, 1000)

    item = summary["items"][0]
    assert item["allocated_quantity"] == 1000
    assert item["remaining_to_allocate"] == 0
    assert item["shortage_quantity"] == 0
    assert summary["allocation_status"] == "fully_allocated"
    stock = inventory_service.get_stock(db, "raw_material", material.id)
    assert stock["quantity_on_hand"] == 1500  # physical stock untouched
    assert stock["quantity_reserved"] == 1000


def test_partial_allocation(db):
    po, requirement, material = _po_with_requirement(db, quantity=1000)
    set_stock(db, material.id, quantity_on_hand=600)

    summary = production_order_material_service.allocate(db, po.id, requirement.id, 600)

    item = summary["items"][0]
    assert item["allocated_quantity"] == 600
    assert item["remaining_to_allocate"] == 400
    assert item["shortage_quantity"] == 400
    assert summary["allocation_status"] == "partially_allocated"


def test_prevents_double_allocation_across_production_orders(db):
    customer = make_customer(db)
    product = make_product(db)
    material = make_raw_material(db)
    make_bom(db, product.id, output_quantity=1)
    make_bom_line(db, product.id, "raw_material", material.id, quantity=1)
    set_stock(db, material.id, quantity_on_hand=1000)

    order_a = make_order(db, customer.id, lines=[{"product_id": product.id, "quantity": 1000, "unit_price": 10}], status="confirmed")
    po_a = make_production_order(db, order_a.id, order_a.lines[0].id, product.id, 1000, DUE)
    production_order_material_service.calculate(db, po_a.id)
    req_a = production_order_material_service.get_requirements(db, po_a.id)[0]

    order_b = make_order(db, customer.id, lines=[{"product_id": product.id, "quantity": 1000, "unit_price": 10}], status="confirmed")
    po_b = make_production_order(db, order_b.id, order_b.lines[0].id, product.id, 1000, DUE)
    production_order_material_service.calculate(db, po_b.id)
    req_b = production_order_material_service.get_requirements(db, po_b.id)[0]

    production_order_material_service.allocate(db, po_a.id, req_a.id, 700)

    with pytest.raises(ValidationAppError):
        production_order_material_service.allocate(db, po_b.id, req_b.id, 500)

    # The legitimately remaining 300 still allocates fine.
    summary_b = production_order_material_service.allocate(db, po_b.id, req_b.id, 300)
    assert summary_b["items"][0]["allocated_quantity"] == 300
    stock = inventory_service.get_stock(db, "raw_material", material.id)
    assert stock["quantity_reserved"] == 1000
    assert stock["quantity_on_hand"] == 1000


def test_release_returns_quantity_to_allocatable_stock(db):
    po, requirement, material = _po_with_requirement(db, quantity=1000)
    set_stock(db, material.id, quantity_on_hand=1000)
    production_order_material_service.allocate(db, po.id, requirement.id, 600)

    summary = production_order_material_service.release(db, po.id, requirement.id, 200)

    item = summary["items"][0]
    assert item["allocated_quantity"] == 400
    stock = inventory_service.get_stock(db, "raw_material", material.id)
    assert stock["quantity_reserved"] == 400
    assert stock["quantity_available"] == 600  # 1000 on hand - 400 reserved
    assert stock["quantity_on_hand"] == 1000  # physical stock untouched


def test_repeated_allocation_request_does_not_double_allocate(db):
    po, requirement, material = _po_with_requirement(db, quantity=1000)
    set_stock(db, material.id, quantity_on_hand=600)

    production_order_material_service.allocate(db, po.id, requirement.id, 600)

    # A retried/duplicated identical request now finds nothing left to
    # give it -- remaining_to_allocate dropped to 400 and available
    # dropped to 0, so a second "allocate 600" is rejected outright.
    with pytest.raises(ValidationAppError):
        production_order_material_service.allocate(db, po.id, requirement.id, 600)

    requirements = production_order_material_service.get_requirements(db, po.id)
    assert float(requirements[0].allocated_quantity) == 600


def test_allocation_rejected_above_required_even_if_available(db):
    po, requirement, material = _po_with_requirement(db, quantity=1000)
    set_stock(db, material.id, quantity_on_hand=2000)

    with pytest.raises(ValidationAppError):
        production_order_material_service.allocate(db, po.id, requirement.id, 1500)


def test_release_rejected_above_allocated(db):
    po, requirement, material = _po_with_requirement(db, quantity=1000)
    set_stock(db, material.id, quantity_on_hand=1000)
    production_order_material_service.allocate(db, po.id, requirement.id, 300)

    with pytest.raises(ValidationAppError):
        production_order_material_service.release(db, po.id, requirement.id, 500)


@pytest.mark.parametrize("quantity", [0, -5])
def test_allocation_rejects_non_positive_quantity(db, quantity):
    po, requirement, material = _po_with_requirement(db, quantity=1000)
    set_stock(db, material.id, quantity_on_hand=1000)

    with pytest.raises(ValidationAppError):
        production_order_material_service.allocate(db, po.id, requirement.id, quantity)


def test_allocation_rejected_for_cancelled_production_order(db):
    po, requirement, material = _po_with_requirement(db, quantity=1000)
    set_stock(db, material.id, quantity_on_hand=1000)
    production_order_service.change_status(db, po.id, "cancelled", reason="Test cancellation.")

    with pytest.raises(ConflictError):
        production_order_material_service.allocate(db, po.id, requirement.id, 500)


def test_cancellation_auto_releases_remaining_allocation(db):
    """P10 Test 12: cancelling a Production Order must not leave a
    hidden reservation behind -- change_status itself releases whatever
    allocated_quantity hasn't been consumed yet, in the same commit as
    the cancellation."""
    po, requirement, material = _po_with_requirement(db, quantity=1000)
    set_stock(db, material.id, quantity_on_hand=1000)
    production_order_material_service.allocate(db, po.id, requirement.id, 600)

    production_order_service.change_status(db, po.id, "cancelled", reason="Test cancellation.")

    summary = production_order_material_service.get_requirement_summary(db, po.id)
    assert summary["items"][0]["allocated_quantity"] == 0
    stock = inventory_service.get_stock(db, "raw_material", material.id)
    assert stock["quantity_reserved"] == 0
    assert stock["quantity_on_hand"] == 1000  # physical stock untouched -- nothing was consumed

    # A manual release afterward now finds nothing left to release.
    with pytest.raises(ValidationAppError):
        production_order_material_service.release(db, po.id, requirement.id, 600)


def test_cancellation_only_releases_the_unconsumed_remainder(db):
    """Material already physically consumed before cancellation is gone
    -- auto-release must never try to return consumed stock to
    allocatable, only whatever's still allocated-and-unconsumed."""
    po, requirement, material = _po_with_requirement(db, quantity=1000)
    set_stock(db, material.id, quantity_on_hand=1000)
    production_order_material_service.allocate(db, po.id, requirement.id, 600)
    production_order_material_service.consume(db, po.id, material.id, 400, execution_id=1)

    production_order_service.change_status(db, po.id, "cancelled", reason="Test cancellation.")

    summary = production_order_material_service.get_requirement_summary(db, po.id)
    item = summary["items"][0]
    assert item["allocated_quantity"] == 400  # the consumed 400 stays on the row, never released
    assert item["consumed_quantity"] == 400
    stock = inventory_service.get_stock(db, "raw_material", material.id)
    assert stock["quantity_reserved"] == 0  # the other 200 (600 - 400) was released
    assert stock["quantity_on_hand"] == 600  # 400 physically issued, not returned by cancellation


def test_allocation_rejected_for_inactive_material(db):
    po, requirement, material = _po_with_requirement(db, quantity=1000)
    set_stock(db, material.id, quantity_on_hand=1000)
    material.status = "inactive"
    db.flush()

    with pytest.raises(ValidationAppError):
        production_order_material_service.allocate(db, po.id, requirement.id, 100)


def test_allocation_status_transitions_across_two_materials(db):
    customer = make_customer(db)
    product = make_product(db)
    cement = make_raw_material(db)
    sand = make_raw_material(db)
    make_bom(db, product.id, output_quantity=1)
    make_bom_line(db, product.id, "raw_material", cement.id, quantity=1)
    make_bom_line(db, product.id, "raw_material", sand.id, quantity=1)
    set_stock(db, cement.id, quantity_on_hand=1000)
    set_stock(db, sand.id, quantity_on_hand=1000)
    order = make_order(db, customer.id, lines=[{"product_id": product.id, "quantity": 500, "unit_price": 10}], status="confirmed")
    po = make_production_order(db, order.id, order.lines[0].id, product.id, 500, DUE)
    production_order_material_service.calculate(db, po.id)
    requirements = {r.raw_material_id: r for r in production_order_material_service.get_requirements(db, po.id)}

    summary = production_order_material_service.get_requirement_summary(db, po.id)
    assert summary["allocation_status"] == "not_allocated"

    production_order_material_service.allocate(db, po.id, requirements[cement.id].id, 500)
    summary = production_order_material_service.get_requirement_summary(db, po.id)
    assert summary["allocation_status"] == "partially_allocated"

    production_order_material_service.allocate(db, po.id, requirements[sand.id].id, 500)
    summary = production_order_material_service.get_requirement_summary(db, po.id)
    assert summary["allocation_status"] == "fully_allocated"
