"""Regression tests for this pass's MRP hardening: shortage netted
against available stock AND confirmed incoming purchase orders (not just
raw on-hand), per-source traceability (which order/production run
created each requirement), incoming-PO awareness (no duplicate
suggestions for what's already covered), expected-availability-date
projection, due-date-miss flagging, grouping by source, and the new
single-shortage "Create PO" action.
"""

from datetime import date, datetime, timedelta

import pytest

from app.core.exceptions import ValidationAppError
from app.services import mrp_service, purchase_order_service

from .factories import (
    make_bom,
    make_bom_line,
    make_customer,
    make_machine,
    make_order,
    make_product,
    make_production_order,
    make_production_schedule,
    make_purchase_order,
    make_raw_material,
    make_supplier,
    make_supplier_material,
    set_stock,
)

TODAY = date(2026, 9, 20)


def _bom_product(db, qty_per_unit: float = 1):
    material = make_raw_material(db, unit="kg")
    machine = make_machine(db)
    product = make_product(db, machine_id=machine.id)
    make_bom(db, product.id, output_quantity=1)
    make_bom_line(db, product.id, "raw_material", material.id, quantity=qty_per_unit, scrap_percent=0)
    return product, material


def test_shortfall_nets_off_available_and_confirmed_incoming(db):
    product, material = _bom_product(db, qty_per_unit=1)
    make_production_schedule(db, product.id, 100, TODAY, TODAY, status="planned")
    set_stock(db, material.id, quantity_on_hand=40, quantity_reserved=10)  # available = 30
    supplier = make_supplier(db)
    make_purchase_order(
        db, supplier.id, lines=[{"raw_material_id": material.id, "quantity": 20, "unit_price": 1}], status="confirmed"
    )

    results = mrp_service.compute_requirements(db)

    row = next(r for r in results if r["raw_material_id"] == material.id)
    assert row["total_required"] == 100
    assert row["available_quantity"] == 30
    assert row["confirmed_incoming_quantity"] == 20
    # 100 - 30 - 20 = 50, not 100 - 40 = 60.
    assert row["shortfall"] == 50


def test_shortage_row_shown_and_marked_fully_covered_by_incoming(db):
    product, material = _bom_product(db)
    make_production_schedule(db, product.id, 50, TODAY, TODAY, status="planned")
    set_stock(db, material.id, quantity_on_hand=10)
    supplier = make_supplier(db)
    make_purchase_order(
        db, supplier.id, lines=[{"raw_material_id": material.id, "quantity": 40, "unit_price": 1}], status="sent"
    )

    results = mrp_service.compute_requirements(db)

    row = next(r for r in results if r["raw_material_id"] == material.id)
    assert row["shortfall"] == 0
    assert row["fully_covered_by_incoming"] is True
    # No new PO should be suggested -- the gap is already covered.
    assert row["suggested_purchases"] == []


def test_incoming_only_partially_covers_reduces_suggested_quantity(db):
    product, material = _bom_product(db)
    make_production_schedule(db, product.id, 100, TODAY, TODAY, status="planned")
    set_stock(db, material.id, quantity_on_hand=0)
    supplier1 = make_supplier(db)
    make_purchase_order(
        db, supplier1.id, lines=[{"raw_material_id": material.id, "quantity": 30, "unit_price": 1}], status="confirmed"
    )
    supplier2 = make_supplier(db)
    make_supplier_material(db, supplier2.id, material.id, lead_time_days=5, max_supply_quantity=1000)

    results = mrp_service.compute_requirements(db)

    row = next(r for r in results if r["raw_material_id"] == material.id)
    assert row["confirmed_incoming_quantity"] == 30
    assert row["shortfall"] == 70
    assert row["suggested_purchases"][0]["quantity"] == 70


def test_incoming_purchase_orders_expose_quantity_and_expected_date(db):
    product, material = _bom_product(db)
    make_production_schedule(db, product.id, 50, TODAY, TODAY, status="planned")
    set_stock(db, material.id, quantity_on_hand=0)
    supplier = make_supplier(db)
    po = make_purchase_order(
        db,
        supplier.id,
        lines=[{"raw_material_id": material.id, "quantity": 20, "unit_price": 1}],
        status="confirmed",
        expected_delivery_date=date(2026, 10, 1),
    )

    results = mrp_service.compute_requirements(db)

    row = next(r for r in results if r["raw_material_id"] == material.id)
    assert len(row["incoming_purchase_orders"]) == 1
    incoming = row["incoming_purchase_orders"][0]
    assert incoming["purchase_order_id"] == po.id
    assert incoming["quantity"] == 20
    assert incoming["expected_delivery_date"] == date(2026, 10, 1)


def test_cancelled_and_received_lines_are_not_confirmed_incoming(db):
    product, material = _bom_product(db)
    make_production_schedule(db, product.id, 50, TODAY, TODAY, status="planned")
    set_stock(db, material.id, quantity_on_hand=0)
    supplier = make_supplier(db)
    make_purchase_order(
        db, supplier.id, lines=[{"raw_material_id": material.id, "quantity": 20, "unit_price": 1}], status="received"
    )
    cancelled_po = make_purchase_order(
        db, supplier.id, lines=[{"raw_material_id": material.id, "quantity": 20, "unit_price": 1}], status="confirmed"
    )
    cancelled_po.lines[0].is_cancelled = True
    db.flush()

    results = mrp_service.compute_requirements(db)

    row = next(r for r in results if r["raw_material_id"] == material.id)
    assert row["confirmed_incoming_quantity"] == 0


def test_source_traces_back_to_production_order(db):
    material = make_raw_material(db)
    machine = make_machine(db)
    product = make_product(db, machine_id=machine.id)
    make_bom(db, product.id, output_quantity=1)
    make_bom_line(db, product.id, "raw_material", material.id, quantity=1, scrap_percent=0)
    customer = make_customer(db)
    order = make_order(
        db, customer.id, lines=[{"product_id": product.id, "quantity": 100, "unit_price": 10}], status="confirmed"
    )
    po = make_production_order(db, order.id, order.lines[0].id, product.id, 100, TODAY)
    make_production_schedule(
        db, product.id, 100, TODAY, TODAY, status="planned", order_id=order.id, production_order_id=po.id
    )
    set_stock(db, material.id, quantity_on_hand=0)

    results = mrp_service.compute_requirements(db)

    row = next(r for r in results if r["raw_material_id"] == material.id)
    assert len(row["sources"]) == 1
    source = row["sources"][0]
    assert source["source_type"] == "production_order"
    assert source["production_order_id"] == po.id
    assert source["production_order_number"] == po.production_order_number


def test_source_traces_back_to_order_without_a_batch(db):
    material = make_raw_material(db)
    product = make_product(db)
    make_bom(db, product.id, output_quantity=1)
    make_bom_line(db, product.id, "raw_material", material.id, quantity=1, scrap_percent=0)
    customer = make_customer(db)
    order = make_order(
        db,
        customer.id,
        lines=[{"product_id": product.id, "quantity": 50, "unit_price": 10}],
        status="confirmed",
        requested_delivery_date=date(2026, 11, 1),
    )
    set_stock(db, material.id, quantity_on_hand=0)

    results = mrp_service.compute_requirements(db)

    row = next(r for r in results if r["raw_material_id"] == material.id)
    source = row["sources"][0]
    assert source["source_type"] == "order"
    assert source["order_id"] == order.id
    assert source["order_number"] == order.order_number
    assert source["required_by_date"] == date(2026, 11, 1)


def test_expected_available_date_projected_from_new_suggestion(db):
    product, material = _bom_product(db)
    make_production_schedule(db, product.id, 50, TODAY, TODAY, status="planned")
    set_stock(db, material.id, quantity_on_hand=0)
    supplier = make_supplier(db)
    make_supplier_material(db, supplier.id, material.id, lead_time_days=5, max_supply_quantity=1000)

    results = mrp_service.compute_requirements(db)

    row = next(r for r in results if r["raw_material_id"] == material.id)
    assert row["date_known"] is True
    assert row["expected_available_date"] is not None


def test_expected_available_date_unknown_without_lead_time(db):
    product, material = _bom_product(db)
    make_production_schedule(db, product.id, 50, TODAY, TODAY, status="planned")
    set_stock(db, material.id, quantity_on_hand=0)
    supplier = make_supplier(db)
    make_supplier_material(db, supplier.id, material.id, lead_time_days=None, max_supply_quantity=1000)

    results = mrp_service.compute_requirements(db)

    row = next(r for r in results if r["raw_material_id"] == material.id)
    assert row["date_known"] is False
    assert row["expected_available_date"] is None


def test_source_at_risk_when_required_before_expected_availability(db):
    material = make_raw_material(db)
    machine = make_machine(db)
    product = make_product(db, machine_id=machine.id)
    make_bom(db, product.id, output_quantity=1)
    make_bom_line(db, product.id, "raw_material", material.id, quantity=1, scrap_percent=0)
    # Needed right away, but nothing is in stock and the only supplier
    # has a long lead time -- this run will miss its date.
    make_production_schedule(db, product.id, 50, TODAY, TODAY, status="planned", planned_start=datetime(2026, 9, 21, 8, 0))
    set_stock(db, material.id, quantity_on_hand=0)
    supplier = make_supplier(db)
    make_supplier_material(db, supplier.id, material.id, lead_time_days=30, max_supply_quantity=1000)

    results = mrp_service.compute_requirements(db)

    row = next(r for r in results if r["raw_material_id"] == material.id)
    assert row["sources"][0]["at_risk"] is True


def test_source_not_at_risk_when_no_shortage_risk(db):
    product, material = _bom_product(db)
    make_production_schedule(db, product.id, 50, TODAY, TODAY, status="planned")
    set_stock(db, material.id, quantity_on_hand=0)
    supplier = make_supplier(db)
    # Fast lead time and a run scheduled well in the future.
    make_supplier_material(db, supplier.id, material.id, lead_time_days=1, max_supply_quantity=1000)
    schedule = make_production_schedule(
        db, product.id, 50, date(2026, 12, 1), date(2026, 12, 1), status="planned",
        planned_start=datetime(2026, 12, 1, 8, 0),
    )

    results = mrp_service.compute_requirements(db)

    row = next(r for r in results if r["raw_material_id"] == material.id)
    matching = [s for s in row["sources"] if s["schedule_id"] == schedule.id]
    assert matching and matching[0]["at_risk"] is False


def test_group_by_source_groups_materials_under_their_production_order(db):
    material_a = make_raw_material(db)
    material_b = make_raw_material(db)
    machine = make_machine(db)
    product = make_product(db, machine_id=machine.id)
    make_bom(db, product.id, output_quantity=1)
    make_bom_line(db, product.id, "raw_material", material_a.id, quantity=1, scrap_percent=0)
    make_bom_line(db, product.id, "raw_material", material_b.id, quantity=2, scrap_percent=0)
    customer = make_customer(db)
    order = make_order(
        db, customer.id, lines=[{"product_id": product.id, "quantity": 20, "unit_price": 10}], status="confirmed"
    )
    po = make_production_order(db, order.id, order.lines[0].id, product.id, 20, TODAY)
    make_production_schedule(
        db, product.id, 20, TODAY, TODAY, status="planned", order_id=order.id, production_order_id=po.id
    )
    set_stock(db, material_a.id, quantity_on_hand=0)
    set_stock(db, material_b.id, quantity_on_hand=0)

    results = mrp_service.compute_requirements(db)
    grouped = mrp_service.group_by_source(results)

    group = next(g for g in grouped if g["source_type"] == "production_order" and g["id"] == po.id)
    assert group["label"] == po.production_order_number
    material_ids = {m["raw_material_id"] for m in group["materials"]}
    assert material_ids == {material_a.id, material_b.id}


def test_create_po_for_shortage_creates_a_draft_po(db):
    material = make_raw_material(db, unit_cost=3)
    supplier = make_supplier(db)
    make_supplier_material(db, supplier.id, material.id, lead_time_days=10, max_supply_quantity=1000)

    po = purchase_order_service.create_purchase_order_for_shortage(db, material.id, supplier.id, 25)

    assert po.status == "draft"
    assert po.supplier_id == supplier.id
    assert len(po.lines) == 1
    assert float(po.lines[0].quantity) == 25
    assert float(po.lines[0].raw_material_id) == material.id
    assert po.expected_delivery_date == purchase_order_service.today_kuwait() + timedelta(days=10)


def test_create_po_for_shortage_rejects_unknown_supplier_material_pairing(db):
    material = make_raw_material(db)
    supplier = make_supplier(db)  # no SupplierMaterial row linking them

    with pytest.raises(ValidationAppError):
        purchase_order_service.create_purchase_order_for_shortage(db, material.id, supplier.id, 10)


def test_create_po_for_shortage_rejects_non_positive_quantity(db):
    material = make_raw_material(db)
    supplier = make_supplier(db)
    make_supplier_material(db, supplier.id, material.id, lead_time_days=5, max_supply_quantity=1000)

    with pytest.raises(ValidationAppError):
        purchase_order_service.create_purchase_order_for_shortage(db, material.id, supplier.id, 0)
