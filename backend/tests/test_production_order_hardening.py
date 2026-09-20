"""Regression tests for this pass's Production Order hardening:
overproduction override on schedules, active/cancelled schedule
splitting, aggregate machine readiness, earliest/latest estimated
completion, and the new consolidated required/scheduled/produced/
remaining/unscheduled figures + make-to-order/make-to-stock labeling on
ProductionOrderOut.
"""

from datetime import date, datetime

import pytest

from app.core.exceptions import ValidationAppError
from app.schemas.production_order import ProductionOrderOut
from app.services import (
    production_execution_service,
    production_order_schedule_service,
    production_order_service,
)

from .factories import (
    make_customer,
    make_machine,
    make_order,
    make_product,
    make_production_order,
)

DUE = date(2026, 12, 1)


def _po(db, quantity: float = 500, production_hours_per_unit: float | None = 0.004, stock_only=False, **overrides):
    machine = make_machine(db)
    product = make_product(db, machine_id=machine.id, production_hours_per_unit=production_hours_per_unit)
    if stock_only:
        po = make_production_order(db, None, None, product.id, quantity, DUE, **overrides)
        return po, product, machine, None
    customer = make_customer(db)
    order = make_order(
        db, customer.id, lines=[{"product_id": product.id, "quantity": quantity, "unit_price": 12.5}], status="confirmed"
    )
    po = make_production_order(db, order.id, order.lines[0].id, product.id, quantity, DUE, **overrides)
    return po, product, machine, order


# ---------------------------------------------------------------------
# Overproduction override on schedules
# ---------------------------------------------------------------------


def test_schedule_beyond_requirement_rejected_without_override(db):
    po, _product, machine, _order = _po(db, quantity=500)
    with pytest.raises(ValidationAppError, match="allow_overproduction"):
        production_order_schedule_service.create_schedule(
            db,
            po.id,
            {
                "machine_id": machine.id,
                "planned_quantity": 600,
                "planned_start": datetime(2026, 9, 25, 8, 0),
                "planned_end": datetime(2026, 9, 25, 10, 0),
            },
        )


def test_schedule_beyond_requirement_with_override_but_no_reason_rejected(db):
    po, _product, machine, _order = _po(db, quantity=500)
    with pytest.raises(ValidationAppError, match="reason"):
        production_order_schedule_service.create_schedule(
            db,
            po.id,
            {
                "machine_id": machine.id,
                "planned_quantity": 600,
                "planned_start": datetime(2026, 9, 25, 8, 0),
                "planned_end": datetime(2026, 9, 25, 10, 0),
                "allow_overproduction": True,
            },
        )


def test_schedule_beyond_requirement_with_override_and_reason_succeeds(db):
    po, _product, machine, _order = _po(db, quantity=500)
    schedule = production_order_schedule_service.create_schedule(
        db,
        po.id,
        {
            "machine_id": machine.id,
            "planned_quantity": 600,
            "planned_start": datetime(2026, 9, 25, 8, 0),
            "planned_end": datetime(2026, 9, 25, 10, 0),
            "allow_overproduction": True,
            "overproduction_reason": "Customer asked for a safety buffer.",
        },
    )
    assert float(schedule.planned_quantity) == 600
    assert schedule.overproduction_reason == "Customer asked for a safety buffer."


def test_reschedule_beyond_requirement_rejected_without_override(db):
    po, _product, machine, _order = _po(db, quantity=500)
    schedule = production_order_schedule_service.create_schedule(
        db,
        po.id,
        {"machine_id": machine.id, "planned_quantity": 300, "planned_start": datetime(2026, 9, 25, 8, 0), "planned_end": datetime(2026, 9, 25, 10, 0)},
    )
    with pytest.raises(ValidationAppError, match="allow_overproduction"):
        production_order_schedule_service.reschedule(db, schedule.id, {"planned_quantity": 600})


def test_reschedule_beyond_requirement_with_override_and_reason_succeeds(db):
    po, _product, machine, _order = _po(db, quantity=500)
    schedule = production_order_schedule_service.create_schedule(
        db,
        po.id,
        {"machine_id": machine.id, "planned_quantity": 300, "planned_start": datetime(2026, 9, 25, 8, 0), "planned_end": datetime(2026, 9, 25, 10, 0)},
    )
    updated = production_order_schedule_service.reschedule(
        db,
        schedule.id,
        {"planned_quantity": 600, "allow_overproduction": True, "overproduction_reason": "Buffer stock."},
    )
    assert float(updated.planned_quantity) == 600
    assert updated.overproduction_reason == "Buffer stock."


def test_schedule_within_requirement_never_needs_a_reason(db):
    po, _product, machine, _order = _po(db, quantity=500)
    schedule = production_order_schedule_service.create_schedule(
        db,
        po.id,
        {"machine_id": machine.id, "planned_quantity": 500, "planned_start": datetime(2026, 9, 25, 8, 0), "planned_end": datetime(2026, 9, 25, 10, 0)},
    )
    assert schedule.overproduction_reason is None


# ---------------------------------------------------------------------
# Active/cancelled split, machine readiness, earliest/latest completion
# ---------------------------------------------------------------------


def test_schedule_summary_splits_active_and_cancelled(db):
    po, _product, machine, _order = _po(db, quantity=500)
    keep = production_order_schedule_service.create_schedule(
        db, po.id, {"machine_id": machine.id, "planned_quantity": 200, "planned_start": datetime(2026, 9, 25, 8, 0), "planned_end": datetime(2026, 9, 25, 10, 0)}
    )
    cancel_me = production_order_schedule_service.create_schedule(
        db, po.id, {"machine_id": machine.id, "planned_quantity": 100, "planned_start": datetime(2026, 9, 26, 8, 0), "planned_end": datetime(2026, 9, 26, 10, 0)}
    )
    production_order_schedule_service.cancel_schedule(db, cancel_me.id, "Not needed.")

    summary = production_order_schedule_service.get_schedule_summary(db, po.id)

    assert [s.id for s in summary["active_schedules"]] == [keep.id]
    assert [s.id for s in summary["cancelled_schedules"]] == [cancel_me.id]
    assert summary["scheduled_quantity"] == 200


def test_machine_readiness_not_applicable_with_no_active_schedules(db):
    po, _product, _machine, _order = _po(db, quantity=500)
    summary = production_order_schedule_service.get_schedule_summary(db, po.id)
    assert summary["machine_status"] == "not_applicable"
    assert summary["machine_issues"] == []


def test_machine_readiness_ready_with_an_active_machine(db):
    po, _product, machine, _order = _po(db, quantity=500)
    production_order_schedule_service.create_schedule(
        db, po.id, {"machine_id": machine.id, "planned_start": datetime(2026, 9, 25, 8, 0), "planned_end": datetime(2026, 9, 25, 10, 0)}
    )
    summary = production_order_schedule_service.get_schedule_summary(db, po.id)
    assert summary["machine_status"] == "ready"
    assert summary["machine_issues"] == []


def test_machine_readiness_not_ready_once_machine_deactivated(db):
    po, _product, machine, _order = _po(db, quantity=500)
    schedule = production_order_schedule_service.create_schedule(
        db, po.id, {"machine_id": machine.id, "planned_start": datetime(2026, 9, 25, 8, 0), "planned_end": datetime(2026, 9, 25, 10, 0)}
    )
    machine.status = "inactive"
    db.flush()

    summary = production_order_schedule_service.get_schedule_summary(db, po.id)

    assert summary["machine_status"] == "not_ready"
    assert summary["machine_issues"] == [schedule.batch_number]


def test_earliest_and_latest_completion_span_active_schedules(db):
    po, _product, machine, _order = _po(db, quantity=500)
    production_order_schedule_service.create_schedule(
        db, po.id, {"machine_id": machine.id, "planned_quantity": 200, "planned_start": datetime(2026, 9, 25, 8, 0), "planned_end": datetime(2026, 9, 25, 10, 0)}
    )
    production_order_schedule_service.create_schedule(
        db, po.id, {"machine_id": machine.id, "planned_quantity": 300, "planned_start": datetime(2026, 9, 27, 8, 0), "planned_end": datetime(2026, 9, 27, 12, 0)}
    )

    summary = production_order_schedule_service.get_schedule_summary(db, po.id)

    assert summary["earliest_completion_date"] == datetime(2026, 9, 25, 10, 0)
    assert summary["latest_completion_date"] == datetime(2026, 9, 27, 12, 0)


def test_completion_dates_ignore_cancelled_schedules(db):
    po, _product, machine, _order = _po(db, quantity=500)
    keep = production_order_schedule_service.create_schedule(
        db, po.id, {"machine_id": machine.id, "planned_quantity": 200, "planned_start": datetime(2026, 9, 25, 8, 0), "planned_end": datetime(2026, 9, 25, 10, 0)}
    )
    late = production_order_schedule_service.create_schedule(
        db, po.id, {"machine_id": machine.id, "planned_quantity": 300, "planned_start": datetime(2026, 9, 30, 8, 0), "planned_end": datetime(2026, 9, 30, 20, 0)}
    )
    production_order_schedule_service.cancel_schedule(db, late.id, "Cancelled.")

    summary = production_order_schedule_service.get_schedule_summary(db, po.id)

    assert summary["earliest_completion_date"] == keep.planned_end
    assert summary["latest_completion_date"] == keep.planned_end


def test_completion_dates_none_with_no_active_schedules(db):
    po, _product, _machine, _order = _po(db, quantity=500)
    summary = production_order_schedule_service.get_schedule_summary(db, po.id)
    assert summary["earliest_completion_date"] is None
    assert summary["latest_completion_date"] is None


# ---------------------------------------------------------------------
# Aggregate quantity helpers
# ---------------------------------------------------------------------


def test_get_scheduled_quantity_sums_non_cancelled_schedules(db):
    po, _product, machine, _order = _po(db, quantity=500)
    production_order_schedule_service.create_schedule(
        db, po.id, {"machine_id": machine.id, "planned_quantity": 200, "planned_start": datetime(2026, 9, 25, 8, 0), "planned_end": datetime(2026, 9, 25, 10, 0)}
    )
    cancelled = production_order_schedule_service.create_schedule(
        db, po.id, {"machine_id": machine.id, "planned_quantity": 100, "planned_start": datetime(2026, 9, 26, 8, 0), "planned_end": datetime(2026, 9, 26, 10, 0)}
    )
    production_order_schedule_service.cancel_schedule(db, cancelled.id, "Not needed.")

    assert production_order_schedule_service.get_scheduled_quantity(db, po.id) == 200


def test_get_produced_quantity_sums_completed_executions(db):
    po, _product, machine, _order = _po(db, quantity=500)
    schedule = production_order_schedule_service.create_schedule(
        db, po.id, {"machine_id": machine.id, "planned_start": datetime(2026, 9, 25, 8, 0), "planned_end": datetime(2026, 9, 25, 20, 0)}
    )
    execution = production_execution_service.start_execution(db, po.id, schedule.id, planned_quantity=300)
    production_execution_service.complete_execution(db, execution.id, 300)

    assert production_execution_service.get_produced_quantity(db, po.id) == 300


# ---------------------------------------------------------------------
# ProductionOrderOut: make-to-order/make-to-stock, order line, quantities
# ---------------------------------------------------------------------


def test_order_linked_production_order_is_make_to_order_with_line_details(db):
    po, _product, _machine, _order = _po(db, quantity=500)
    loaded = production_order_service.get_production_order(db, po.id)

    out = ProductionOrderOut.from_model(loaded)

    assert out.production_type == "make_to_order"
    assert out.order_line_unit_price == 12.5
    assert out.required_quantity == 500


def test_stock_only_production_order_is_make_to_stock(db):
    po, _product, _machine, _order = _po(db, quantity=500, stock_only=True)
    loaded = production_order_service.get_production_order(db, po.id)

    out = ProductionOrderOut.from_model(loaded)

    assert out.production_type == "make_to_stock"
    assert out.order_line_unit_price is None
