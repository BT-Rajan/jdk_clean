"""Regression tests for this pass's Inventory hardening: available vs.
reserved vs. free stock, reservation-lifecycle traceability, manual-
adjustment reason/reserved-stock/approval guards, raw-material stock by
material_type (packaging shown independently), and packaging consumption
wired into production completion.
"""

import pytest

from app.core.exceptions import ConflictError, ValidationAppError
from app.models.setting import Setting
from app.services import (
    inventory_service,
    production_execution_service,
    production_order_material_service,
    production_order_schedule_service,
    production_order_service,
)

from .factories import (
    make_customer,
    make_machine,
    make_order,
    make_packaging_line,
    make_product,
    make_production_order,
    make_raw_material,
    set_stock,
)

from datetime import date, datetime

DUE = date(2026, 12, 1)


def _set_threshold(db, value: str) -> None:
    db.add(Setting(setting_key="large_stock_adjustment_threshold", setting_value=value))
    db.flush()


# ---------------------------------------------------------------------
# Available / reserved / free stock
# ---------------------------------------------------------------------


def test_get_stock_reports_on_hand_reserved_and_available_separately(db):
    material = make_raw_material(db)
    set_stock(db, material.id, quantity_on_hand=100, quantity_reserved=30)

    stock = inventory_service.get_stock(db, "raw_material", material.id)

    assert stock["quantity_on_hand"] == 100
    assert stock["quantity_reserved"] == 30
    assert stock["quantity_available"] == 70


# ---------------------------------------------------------------------
# Manual adjustment: reason required, reserved-stock guard, override
# ---------------------------------------------------------------------


def test_manual_adjustment_requires_a_reason(db):
    material = make_raw_material(db)
    set_stock(db, material.id, quantity_on_hand=100)

    with pytest.raises(ValidationAppError):
        inventory_service.submit_manual_adjustment(db, "raw_material", material.id, -10, "issue", "")


def test_manual_adjustment_cannot_dip_into_reserved_stock(db):
    material = make_raw_material(db)
    set_stock(db, material.id, quantity_on_hand=100, quantity_reserved=80)

    with pytest.raises(ConflictError):
        # Only 20 available, but this asks to issue 50 -- on hand alone
        # (100) would tolerate it, but it would eat into the 80 reserved.
        inventory_service.submit_manual_adjustment(db, "raw_material", material.id, -50, "issue", "Stock count correction.")


def test_manual_adjustment_within_available_succeeds(db):
    material = make_raw_material(db)
    set_stock(db, material.id, quantity_on_hand=100, quantity_reserved=80)

    result = inventory_service.submit_manual_adjustment(
        db, "raw_material", material.id, -15, "issue", "Damaged in handling."
    )

    assert result["status"] == "applied"
    assert result["stock"]["quantity_on_hand"] == 85


def test_manual_adjustment_override_allows_dipping_into_reserved(db):
    material = make_raw_material(db)
    set_stock(db, material.id, quantity_on_hand=100, quantity_reserved=80)

    stock = inventory_service.adjust_stock(
        db, "raw_material", material.id, -50, "issue",
        notes="Emergency use, override confirmed with warehouse manager.",
        is_manual=True, allow_negative_stock=True,
    )

    assert stock["quantity_on_hand"] == 50


def test_internal_consumption_is_not_blocked_by_the_reserved_stock_guard(db):
    """The reserved-stock guard is manual-only -- an internal, coordinated
    multi-step transaction (like production_order_material_service.
    consume, which issues stock before releasing the very reservation
    that covered it) must never trip it."""
    material = make_raw_material(db)
    set_stock(db, material.id, quantity_on_hand=100, quantity_reserved=100)

    stock = inventory_service.adjust_stock(db, "raw_material", material.id, -100, "issue", notes="internal")

    assert stock["quantity_on_hand"] == 0


def test_adjust_stock_returns_the_movement_id(db):
    material = make_raw_material(db)
    set_stock(db, material.id, quantity_on_hand=100)

    stock = inventory_service.adjust_stock(db, "raw_material", material.id, -10, "issue", notes="test")

    assert stock["movement_id"] is not None
    movements = inventory_service.get_movement_history(db, item_type="raw_material", item_id=material.id)
    assert movements["items"][0]["id"] == stock["movement_id"]


# ---------------------------------------------------------------------
# Reservation lifecycle traceability
# ---------------------------------------------------------------------


def test_reserve_stock_logs_a_traceable_movement(db):
    material = make_raw_material(db)
    set_stock(db, material.id, quantity_on_hand=100)

    inventory_service.reserve_stock(
        db, "raw_material", material.id, 30, reference_type="order", reference_id=42
    )

    movements = inventory_service.get_movement_history(
        db, item_type="raw_material", item_id=material.id, reference_type="order", reference_id=42
    )
    assert movements["total"] == 1
    assert movements["items"][0]["movement_type"] == "reserve"
    assert movements["items"][0]["quantity"] == 30


def test_release_reservation_logs_a_traceable_movement(db):
    material = make_raw_material(db)
    set_stock(db, material.id, quantity_on_hand=100, quantity_reserved=30)

    inventory_service.release_reservation(
        db, "raw_material", material.id, 30, reference_type="order", reference_id=42
    )

    movements = inventory_service.get_movement_history(
        db, item_type="raw_material", item_id=material.id, reference_type="order", reference_id=42
    )
    assert movements["total"] == 1
    assert movements["items"][0]["movement_type"] == "release"


def test_reserve_stock_within_available_logs_a_traceable_movement(db):
    material = make_raw_material(db)
    set_stock(db, material.id, quantity_on_hand=100)

    inventory_service.reserve_stock_within_available(
        db, "raw_material", material.id, 40, reference_type="production_order", reference_id=7
    )

    movements = inventory_service.get_movement_history(
        db, item_type="raw_material", item_id=material.id, reference_type="production_order", reference_id=7
    )
    assert movements["total"] == 1
    assert movements["items"][0]["movement_type"] == "reserve"


# ---------------------------------------------------------------------
# Approval threshold workflow
# ---------------------------------------------------------------------


def test_below_threshold_adjustment_applies_immediately(db):
    material = make_raw_material(db)
    set_stock(db, material.id, quantity_on_hand=100)
    _set_threshold(db, "500")

    result = inventory_service.submit_manual_adjustment(
        db, "raw_material", material.id, -10, "issue", "Small correction."
    )

    assert result["status"] == "applied"
    assert result["request"] is None


def test_at_or_above_threshold_adjustment_is_held_for_approval(db):
    material = make_raw_material(db)
    set_stock(db, material.id, quantity_on_hand=1000)
    _set_threshold(db, "500")

    result = inventory_service.submit_manual_adjustment(
        db, "raw_material", material.id, -500, "issue", "Large write-off."
    )

    assert result["status"] == "pending_approval"
    assert result["request"].status == "pending"
    # Not applied yet -- stock is untouched.
    stock = inventory_service.get_stock(db, "raw_material", material.id)
    assert stock["quantity_on_hand"] == 1000


def test_approving_a_pending_request_applies_it(db):
    material = make_raw_material(db)
    set_stock(db, material.id, quantity_on_hand=1000)
    _set_threshold(db, "500")
    result = inventory_service.submit_manual_adjustment(
        db, "raw_material", material.id, -500, "issue", "Large write-off."
    )
    request = result["request"]

    approved = inventory_service.approve_stock_adjustment_request(db, request.id)

    assert approved.status == "applied"
    assert approved.resulting_movement_id is not None
    stock = inventory_service.get_stock(db, "raw_material", material.id)
    assert stock["quantity_on_hand"] == 500


def test_approving_a_non_pending_request_is_rejected(db):
    material = make_raw_material(db)
    set_stock(db, material.id, quantity_on_hand=1000)
    _set_threshold(db, "500")
    result = inventory_service.submit_manual_adjustment(
        db, "raw_material", material.id, -500, "issue", "Large write-off."
    )
    request = result["request"]
    inventory_service.approve_stock_adjustment_request(db, request.id)

    with pytest.raises(ConflictError):
        inventory_service.approve_stock_adjustment_request(db, request.id)


def test_rejecting_a_pending_request_requires_a_reason(db):
    material = make_raw_material(db)
    set_stock(db, material.id, quantity_on_hand=1000)
    _set_threshold(db, "500")
    result = inventory_service.submit_manual_adjustment(
        db, "raw_material", material.id, -500, "issue", "Large write-off."
    )
    request = result["request"]

    with pytest.raises(ValidationAppError):
        inventory_service.reject_stock_adjustment_request(db, request.id, "")


def test_rejecting_a_pending_request_leaves_stock_untouched(db):
    material = make_raw_material(db)
    set_stock(db, material.id, quantity_on_hand=1000)
    _set_threshold(db, "500")
    result = inventory_service.submit_manual_adjustment(
        db, "raw_material", material.id, -500, "issue", "Large write-off."
    )
    request = result["request"]

    rejected = inventory_service.reject_stock_adjustment_request(db, request.id, "Not justified.")

    assert rejected.status == "rejected"
    assert rejected.rejection_reason == "Not justified."
    stock = inventory_service.get_stock(db, "raw_material", material.id)
    assert stock["quantity_on_hand"] == 1000


def test_no_threshold_set_never_requires_approval(db):
    material = make_raw_material(db)
    set_stock(db, material.id, quantity_on_hand=100000)

    result = inventory_service.submit_manual_adjustment(
        db, "raw_material", material.id, -99999, "issue", "Huge but no gate configured."
    )

    assert result["status"] == "applied"


# ---------------------------------------------------------------------
# Raw material stock by material_type (packaging shown independently)
# ---------------------------------------------------------------------


def test_raw_material_stock_filters_by_material_type(db):
    packaging = make_raw_material(db, material_type="packaging")
    ordinary = make_raw_material(db, material_type="raw_material")
    set_stock(db, packaging.id, quantity_on_hand=500)
    set_stock(db, ordinary.id, quantity_on_hand=200)

    packaging_only = inventory_service.get_raw_material_stock(db, material_type="packaging")
    ids = [i["raw_material_id"] for i in packaging_only["items"]]

    assert packaging.id in ids
    assert ordinary.id not in ids


def test_raw_material_stock_shows_available_breakdown(db):
    material = make_raw_material(db)
    set_stock(db, material.id, quantity_on_hand=50, quantity_reserved=20)

    result = inventory_service.get_raw_material_stock(db, search=material.code)

    item = result["items"][0]
    assert item["quantity_on_hand"] == 50
    assert item["quantity_reserved"] == 20
    assert item["quantity_available"] == 30


# ---------------------------------------------------------------------
# Packaging consumption wired into production completion
# ---------------------------------------------------------------------


def _po_with_schedule_and_packaging(db, quantity: float = 100):
    customer = make_customer(db)
    machine = make_machine(db)
    bom_material = make_raw_material(db)
    packaging_material = make_raw_material(db, material_type="packaging")
    product = make_product(db, machine_id=machine.id, production_hours_per_unit=0.001)
    from .factories import make_bom, make_bom_line

    make_bom(db, product.id, output_quantity=1)
    make_bom_line(db, product.id, "raw_material", bom_material.id, quantity=1, scrap_percent=0)
    make_packaging_line(db, product.id, packaging_material.id, quantity_per_unit=2)
    set_stock(db, bom_material.id, 10_000)
    set_stock(db, packaging_material.id, 10_000)

    order = make_order(
        db, customer.id, lines=[{"product_id": product.id, "quantity": quantity, "unit_price": 10}], status="confirmed"
    )
    po = make_production_order(db, order.id, order.lines[0].id, product.id, quantity, DUE)
    production_order_material_service.calculate(db, po.id)
    for requirement in production_order_material_service.get_requirements(db, po.id):
        production_order_material_service.allocate(db, po.id, requirement.id, float(requirement.required_quantity))

    schedule = production_order_schedule_service.create_schedule(
        db, po.id,
        {"machine_id": machine.id, "planned_start": datetime(2026, 9, 25, 8, 0), "planned_end": datetime(2026, 9, 25, 20, 0)},
    )
    return po, schedule, packaging_material


def test_completion_consumes_packaging_material_stock(db):
    po, schedule, packaging_material = _po_with_schedule_and_packaging(db, quantity=100)
    execution = production_execution_service.start_execution(db, po.id, schedule.id, planned_quantity=100)

    before = inventory_service.get_stock(db, "raw_material", packaging_material.id)
    production_execution_service.complete_execution(db, execution.id, 100)
    after = inventory_service.get_stock(db, "raw_material", packaging_material.id)

    # 2 units of packaging per finished unit * 100 units produced = 200.
    assert before["quantity_on_hand"] - after["quantity_on_hand"] == 200


def test_completion_records_packaging_consumption_on_the_requirement_row(db):
    po, schedule, packaging_material = _po_with_schedule_and_packaging(db, quantity=100)
    execution = production_execution_service.start_execution(db, po.id, schedule.id, planned_quantity=100)

    production_execution_service.complete_execution(db, execution.id, 100)

    requirements = production_order_material_service.get_requirements(db, po.id)
    packaging_req = next(r for r in requirements if r.raw_material_id == packaging_material.id)
    assert float(packaging_req.consumed_quantity) == 200
