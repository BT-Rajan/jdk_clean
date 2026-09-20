"""Regression tests for production_execution_service's P6 execution --
the UAT scenarios from the P6 spec: start, record actual quantity across
multiple runs, overproduction protection, completion, material issue,
no-accidental-stock-movement, duplicate start, and Kuwait timestamps.
"""

from datetime import date, datetime, timedelta

import pytest

from app.core.exceptions import ConflictError, NotFoundError, ValidationAppError
from app.core.timezone import now_kuwait_naive
from app.services import (
    inventory_service,
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
    make_product,
    make_production_order,
    make_raw_material,
    set_stock,
)

DUE = date(2026, 12, 1)


def _po_with_schedule(db, quantity: float = 500, bom_quantity_per_unit: float = 1, stock: float = 10_000):
    """A planned Production Order with a single-material BOM, calculated
    requirements, and one active schedule -- everything P6 execution
    builds on top of (P2-P5)."""
    customer = make_customer(db)
    machine = make_machine(db)
    material = make_raw_material(db)
    product = make_product(db, machine_id=machine.id, production_hours_per_unit=0.001)
    make_bom(db, product.id, output_quantity=1)
    make_bom_line(db, product.id, "raw_material", material.id, quantity=bom_quantity_per_unit, scrap_percent=0)
    set_stock(db, material.id, stock)

    order = make_order(
        db, customer.id, lines=[{"product_id": product.id, "quantity": quantity, "unit_price": 10}], status="confirmed"
    )
    po = make_production_order(db, order.id, order.lines[0].id, product.id, quantity, DUE)
    production_order_material_service.calculate(db, po.id)
    requirement = production_order_material_service.get_requirements(db, po.id)[0]

    schedule = production_order_schedule_service.create_schedule(
        db,
        po.id,
        {"machine_id": machine.id, "planned_start": datetime(2026, 9, 25, 8, 0), "planned_end": datetime(2026, 9, 25, 20, 0)},
    )
    return po, schedule, material, requirement


def test_start_execution_creates_in_progress_run(db):
    po, schedule, material, requirement = _po_with_schedule(db, quantity=500)

    execution = production_execution_service.start_execution(db, po.id, schedule.id)

    assert execution.status == "in_progress"
    assert execution.production_order_id == po.id
    assert execution.schedule_id == schedule.id
    assert execution.machine_id == schedule.machine_id
    assert execution.started_at is not None
    assert execution.started_at.tzinfo is None


def test_complete_execution_records_actual_quantity_and_progress(db):
    po, schedule, material, requirement = _po_with_schedule(db, quantity=500)
    production_order_material_service.allocate(db, po.id, requirement.id, 500)
    execution = production_execution_service.start_execution(db, po.id, schedule.id, planned_quantity=300)

    production_execution_service.complete_execution(db, execution.id, 300)
    progress = production_execution_service.get_progress(db, po.id)

    assert progress["planned_quantity"] == 500
    assert progress["total_produced"] == 300
    assert progress["remaining_to_produce"] == 200
    assert progress["execution_status"] == "partially_completed"


def test_second_run_completes_the_full_quantity(db):
    po, schedule, material, requirement = _po_with_schedule(db, quantity=500)
    production_order_material_service.allocate(db, po.id, requirement.id, 500)
    run1 = production_execution_service.start_execution(db, po.id, schedule.id, planned_quantity=300)
    production_execution_service.complete_execution(db, run1.id, 300)

    run2 = production_execution_service.start_execution(db, po.id, schedule.id, planned_quantity=200)
    production_execution_service.complete_execution(db, run2.id, 200)

    progress = production_execution_service.get_progress(db, po.id)
    assert progress["total_produced"] == 500
    assert progress["remaining_to_produce"] == 0
    assert progress["execution_status"] == "completed"
    assert len(progress["runs"]) == 2


def test_overproduction_rejected_at_start(db):
    po, schedule, material, requirement = _po_with_schedule(db, quantity=500)
    production_order_material_service.allocate(db, po.id, requirement.id, 500)
    run1 = production_execution_service.start_execution(db, po.id, schedule.id, planned_quantity=500)
    production_execution_service.complete_execution(db, run1.id, 500)

    with pytest.raises(ValidationAppError):
        production_execution_service.start_execution(db, po.id, schedule.id, planned_quantity=1)


def test_overproduction_rejected_at_completion(db):
    """Even if a run was started for less, completion itself re-checks
    the production order's total -- a run may report more than it
    planned to (spec section 4), but never past the order's own ceiling."""
    po, schedule, material, requirement = _po_with_schedule(db, quantity=500)
    production_order_material_service.allocate(db, po.id, requirement.id, 500)
    run1 = production_execution_service.start_execution(db, po.id, schedule.id, planned_quantity=100)

    with pytest.raises(ValidationAppError):
        production_execution_service.complete_execution(db, run1.id, 600)


def test_completed_execution_is_immutable(db):
    po, schedule, material, requirement = _po_with_schedule(db, quantity=500)
    production_order_material_service.allocate(db, po.id, requirement.id, 500)
    execution = production_execution_service.start_execution(db, po.id, schedule.id, planned_quantity=300)
    production_execution_service.complete_execution(db, execution.id, 300)

    with pytest.raises(ConflictError):
        production_execution_service.complete_execution(db, execution.id, 50)
    with pytest.raises(ConflictError):
        production_execution_service.cancel_execution(db, execution.id, "changed my mind")


def test_completion_calculates_duration_and_kuwait_timestamps(db):
    po, schedule, material, requirement = _po_with_schedule(db, quantity=500)
    production_order_material_service.allocate(db, po.id, requirement.id, 500)
    # DATETIME columns truncate to whole seconds on round-trip -- widen
    # the window by a second on each side rather than asserting to
    # microsecond precision against something MySQL itself doesn't store.
    before = now_kuwait_naive().replace(microsecond=0) - timedelta(seconds=1)
    execution = production_execution_service.start_execution(db, po.id, schedule.id, planned_quantity=300)
    production_execution_service.complete_execution(db, execution.id, 300)
    after = now_kuwait_naive().replace(microsecond=0) + timedelta(seconds=1)

    completed = production_execution_service.get_execution(db, execution.id)
    assert completed.started_at.tzinfo is None
    assert completed.ended_at.tzinfo is None
    assert before <= completed.started_at <= after
    assert before <= completed.ended_at <= after
    assert completed.ended_at >= completed.started_at


def test_material_issue_decreases_stock_and_tracks_allocation(db):
    po, schedule, material, requirement = _po_with_schedule(db, quantity=500, bom_quantity_per_unit=2)
    production_order_material_service.allocate(db, po.id, requirement.id, 1000)  # 500 * 2
    stock_before = inventory_service.get_stock(db, "raw_material", material.id)
    execution = production_execution_service.start_execution(db, po.id, schedule.id, planned_quantity=300)

    production_execution_service.complete_execution(db, execution.id, 300)

    stock_after = inventory_service.get_stock(db, "raw_material", material.id)
    assert stock_after["quantity_on_hand"] == stock_before["quantity_on_hand"] - 600  # 300 * 2
    assert stock_after["quantity_reserved"] == stock_before["quantity_reserved"] - 600

    summary = production_order_material_service.get_requirement_summary(db, po.id)
    item = summary["items"][0]
    assert item["consumed_quantity"] == 600
    assert item["allocated_quantity"] == 1000  # untouched -- see consume()'s docstring
    assert item["remaining_allocated"] == 400

    movements = inventory_service.get_movement_history(
        db, item_type="raw_material", item_id=material.id, reference_type="production_execution", reference_id=execution.id
    )
    assert movements["total"] == 1
    assert movements["items"][0]["quantity"] == -600


def test_consumption_capped_by_allocated_quantity(db):
    """Allocated Material Protection (spec section 8): production cannot
    consume more of a material than was legitimately allocated, even if
    more is sitting on the shelf."""
    po, schedule, material, requirement = _po_with_schedule(db, quantity=500, bom_quantity_per_unit=2, stock=10_000)
    production_order_material_service.allocate(db, po.id, requirement.id, 100)  # far less than 300*2=600 needed
    execution = production_execution_service.start_execution(db, po.id, schedule.id, planned_quantity=300)

    with pytest.raises(ValidationAppError):
        production_execution_service.complete_execution(db, execution.id, 300)

    # Nothing was consumed or produced -- the whole completion rolled back.
    stock = inventory_service.get_stock(db, "raw_material", material.id)
    assert stock["quantity_on_hand"] == 10_000
    still_in_progress = production_execution_service.get_execution(db, execution.id)
    assert still_in_progress.status == "in_progress"


def test_completion_preserves_reported_material_variance(db):
    """P10 Test 7: required (BOM-scaled) = 1,000 kg, actual reported
    consumption = 1,050 kg. The variance must be preserved and visible
    on the requirement row, never silently clamped back to 1,000."""
    po, schedule, material, requirement = _po_with_schedule(db, quantity=1000, bom_quantity_per_unit=1, stock=10_000)
    production_order_material_service.allocate(db, po.id, requirement.id, 1000)
    execution = production_execution_service.start_execution(db, po.id, schedule.id, planned_quantity=1000)

    production_execution_service.complete_execution(
        db, execution.id, 1000, actual_materials=[{"raw_material_id": material.id, "quantity_used": 1050}]
    )

    summary = production_order_material_service.get_requirement_summary(db, po.id)
    item = summary["items"][0]
    assert item["required_quantity"] == 1000  # BOM figure untouched
    assert item["consumed_quantity"] == 1050  # actual figure preserved, not clamped to 1,000
    assert item["allocated_quantity"] == 1050  # auto-expanded to cover the extra 50

    stock = inventory_service.get_stock(db, "raw_material", material.id)
    assert stock["quantity_on_hand"] == 10_000 - 1050


def test_actual_material_variance_still_refuses_unavailable_stock(db):
    """The variance path is not a blank check -- it still refuses to
    consume more than what's physically available."""
    po, schedule, material, requirement = _po_with_schedule(db, quantity=1000, bom_quantity_per_unit=1, stock=1000)
    production_order_material_service.allocate(db, po.id, requirement.id, 1000)
    execution = production_execution_service.start_execution(db, po.id, schedule.id, planned_quantity=1000)

    with pytest.raises(ValidationAppError):
        production_execution_service.complete_execution(
            db, execution.id, 1000, actual_materials=[{"raw_material_id": material.id, "quantity_used": 1050}]
        )

    stock = inventory_service.get_stock(db, "raw_material", material.id)
    assert stock["quantity_on_hand"] == 1000  # nothing consumed -- rolled back


def test_actual_materials_for_unknown_material_is_rejected(db):
    po, schedule, material, requirement = _po_with_schedule(db, quantity=1000, bom_quantity_per_unit=1, stock=10_000)
    production_order_material_service.allocate(db, po.id, requirement.id, 1000)
    execution = production_execution_service.start_execution(db, po.id, schedule.id, planned_quantity=1000)

    with pytest.raises(ValidationAppError):
        production_execution_service.complete_execution(
            db, execution.id, 1000, actual_materials=[{"raw_material_id": material.id + 999, "quantity_used": 10}]
        )


def test_scheduling_and_starting_do_not_move_stock(db):
    po, schedule, material, requirement = _po_with_schedule(db, quantity=500)
    production_order_material_service.allocate(db, po.id, requirement.id, 500)
    stock_before = inventory_service.get_stock(db, "raw_material", material.id)

    production_execution_service.start_execution(db, po.id, schedule.id, planned_quantity=300)

    stock_after = inventory_service.get_stock(db, "raw_material", material.id)
    assert stock_after == stock_before


def test_duplicate_start_on_the_same_schedule_is_rejected(db):
    po, schedule, material, requirement = _po_with_schedule(db, quantity=500)
    production_execution_service.start_execution(db, po.id, schedule.id, planned_quantity=100)

    with pytest.raises(ConflictError):
        production_execution_service.start_execution(db, po.id, schedule.id, planned_quantity=100)


def test_start_rejected_for_cancelled_production_order(db):
    po, schedule, material, requirement = _po_with_schedule(db, quantity=500)
    production_order_service.change_status(db, po.id, "cancelled", reason="Test cancellation.")

    with pytest.raises(ConflictError):
        production_execution_service.start_execution(db, po.id, schedule.id)


def test_start_rejected_for_cancelled_schedule(db):
    po, schedule, material, requirement = _po_with_schedule(db, quantity=500)
    production_order_schedule_service.cancel_schedule(db, schedule.id, "Machine unavailable.")

    with pytest.raises(ConflictError):
        production_execution_service.start_execution(db, po.id, schedule.id)


def test_start_rejected_for_mismatched_schedule(db):
    po_a, schedule_a, _, _ = _po_with_schedule(db, quantity=500)
    po_b, schedule_b, _, _ = _po_with_schedule(db, quantity=500)

    with pytest.raises(ValidationAppError):
        production_execution_service.start_execution(db, po_a.id, schedule_b.id)


def test_start_rejected_for_inactive_machine(db):
    po, schedule, material, requirement = _po_with_schedule(db, quantity=500)
    schedule.machine.status = "inactive"
    db.flush()

    with pytest.raises(ValidationAppError):
        production_execution_service.start_execution(db, po.id, schedule.id)


def test_start_rejected_for_nonexistent_schedule(db):
    po, schedule, material, requirement = _po_with_schedule(db, quantity=500)

    with pytest.raises(NotFoundError):
        production_execution_service.start_execution(db, po.id, 999999)


@pytest.mark.parametrize("quantity", [0, -5, None])
def test_complete_rejects_non_positive_produced_quantity(db, quantity):
    po, schedule, material, requirement = _po_with_schedule(db, quantity=500)
    production_order_material_service.allocate(db, po.id, requirement.id, 500)
    execution = production_execution_service.start_execution(db, po.id, schedule.id, planned_quantity=100)

    with pytest.raises(ValidationAppError):
        production_execution_service.complete_execution(db, execution.id, quantity)


def test_cancel_execution_requires_a_reason(db):
    po, schedule, material, requirement = _po_with_schedule(db, quantity=500)
    execution = production_execution_service.start_execution(db, po.id, schedule.id, planned_quantity=100)

    with pytest.raises(ValidationAppError):
        production_execution_service.cancel_execution(db, execution.id, "")


def test_cancel_execution_preserves_history_and_moves_no_stock(db):
    po, schedule, material, requirement = _po_with_schedule(db, quantity=500)
    production_order_material_service.allocate(db, po.id, requirement.id, 500)
    stock_before = inventory_service.get_stock(db, "raw_material", material.id)
    execution = production_execution_service.start_execution(db, po.id, schedule.id, planned_quantity=100)

    cancelled = production_execution_service.cancel_execution(db, execution.id, "Machine breakdown.")

    assert cancelled.status == "cancelled"
    assert cancelled.cancel_reason == "Machine breakdown."
    # Still there, still traceable to its production order -- never deleted.
    assert production_execution_service.get_execution(db, execution.id).id == execution.id
    stock_after = inventory_service.get_stock(db, "raw_material", material.id)
    assert stock_after == stock_before
    # A cancelled run frees the schedule up for a fresh start.
    production_execution_service.start_execution(db, po.id, schedule.id, planned_quantity=100)
