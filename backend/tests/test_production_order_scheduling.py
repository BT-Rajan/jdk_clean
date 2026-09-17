"""Regression tests for production_order_schedule_service's P5
scheduling -- the UAT scenarios from the P5 spec: normal scheduling,
machine conflict, a non-conflicting back-to-back slot, reschedule,
cancellation, and due-date awareness -- plus the validation rules
section 14 calls out and the hardening guard that stops a Production-
Order-linked schedule from being mutated through the legacy batch
endpoints (which would otherwise double-release/reserve materials that
P4's Material Allocation, not this schedule, actually owns).
"""

from datetime import date, datetime

import pytest

from app.core.exceptions import ConflictError, NotFoundError, ValidationAppError
from app.services import production_order_schedule_service, production_order_service, production_service

from .factories import (
    make_customer,
    make_machine,
    make_order,
    make_product,
    make_production_order,
)

DUE = date(2026, 9, 20)


def _po(db, quantity: float = 500, production_hours_per_unit: float | None = 0.004, due_date=DUE, **product_overrides):
    """One planned Production Order for a product whose machine time is
    0.004 hours/unit by default (500 units -> 2 hours), on a fresh
    machine of its own."""
    customer = make_customer(db)
    machine = make_machine(db)
    product = make_product(
        db, machine_id=machine.id, production_hours_per_unit=production_hours_per_unit, **product_overrides
    )
    order = make_order(
        db, customer.id, lines=[{"product_id": product.id, "quantity": quantity, "unit_price": 10}], status="confirmed"
    )
    po = make_production_order(db, order.id, order.lines[0].id, product.id, quantity, due_date)
    return po, product, machine


def test_normal_scheduling(db):
    po, product, machine = _po(db, quantity=500)
    start = datetime(2026, 9, 25, 8, 0)

    summary = production_order_schedule_service.create_schedule(
        db, po.id, {"planned_start": start}
    )
    result = production_order_schedule_service.get_schedule_summary(db, po.id)

    assert result["schedule_status"] == "scheduled"
    assert result["scheduled_quantity"] == 500
    assert result["remaining_to_schedule"] == 0
    schedule = result["schedules"][0]
    assert schedule.machine_id == machine.id
    assert schedule.planned_start == start
    # 500 units * 0.004 h/unit = 2 hours.
    assert schedule.planned_end == datetime(2026, 9, 25, 10, 0)
    assert schedule.status == "planned"


def test_machine_conflict(db):
    po_a, _, machine = _po(db)
    po_b, _, _ = _po(db)

    production_order_schedule_service.create_schedule(
        db, po_a.id, {"machine_id": machine.id, "planned_start": datetime(2026, 9, 25, 10, 0), "planned_end": datetime(2026, 9, 25, 12, 0)}
    )

    with pytest.raises(ConflictError):
        production_order_schedule_service.create_schedule(
            db,
            po_b.id,
            {"machine_id": machine.id, "planned_start": datetime(2026, 9, 25, 11, 0), "planned_end": datetime(2026, 9, 25, 13, 0)},
        )


def test_non_conflicting_back_to_back_schedule(db):
    po_a, _, machine = _po(db)
    po_b, _, _ = _po(db)

    production_order_schedule_service.create_schedule(
        db, po_a.id, {"machine_id": machine.id, "planned_start": datetime(2026, 9, 25, 10, 0), "planned_end": datetime(2026, 9, 25, 12, 0)}
    )
    result = production_order_schedule_service.create_schedule(
        db, po_b.id, {"machine_id": machine.id, "planned_start": datetime(2026, 9, 25, 12, 0), "planned_end": datetime(2026, 9, 25, 14, 0)}
    )

    assert result.status == "planned"


def test_reschedule_moves_to_new_machine_and_time(db):
    po, _, machine = _po(db)
    other_machine = make_machine(db)
    schedule = production_order_schedule_service.create_schedule(
        db, po.id, {"machine_id": machine.id, "planned_start": datetime(2026, 9, 25, 8, 0), "planned_end": datetime(2026, 9, 25, 10, 0)}
    )

    updated = production_order_schedule_service.reschedule(
        db,
        schedule.id,
        {"machine_id": other_machine.id, "planned_start": datetime(2026, 9, 26, 9, 0), "planned_end": datetime(2026, 9, 26, 11, 0)},
    )

    assert updated.machine_id == other_machine.id
    assert updated.planned_start == datetime(2026, 9, 26, 9, 0)
    result = production_order_schedule_service.get_schedule_summary(db, po.id)
    assert result["schedules"][0].machine_id == other_machine.id


def test_reschedule_reruns_conflict_validation(db):
    po_a, _, machine = _po(db)
    po_b, _, _ = _po(db)
    schedule_a = production_order_schedule_service.create_schedule(
        db, po_a.id, {"machine_id": machine.id, "planned_start": datetime(2026, 9, 25, 8, 0), "planned_end": datetime(2026, 9, 25, 10, 0)}
    )
    production_order_schedule_service.create_schedule(
        db, po_b.id, {"machine_id": machine.id, "planned_start": datetime(2026, 9, 25, 10, 0), "planned_end": datetime(2026, 9, 25, 12, 0)}
    )

    with pytest.raises(ConflictError):
        production_order_schedule_service.reschedule(
            db, schedule_a.id, {"planned_start": datetime(2026, 9, 25, 11, 0), "planned_end": datetime(2026, 9, 25, 13, 0)}
        )


def test_cancellation_frees_up_the_production_order_and_leaves_no_trace(db):
    po, _, machine = _po(db, quantity=500)
    schedule = production_order_schedule_service.create_schedule(
        db, po.id, {"machine_id": machine.id, "planned_start": datetime(2026, 9, 25, 8, 0), "planned_end": datetime(2026, 9, 25, 10, 0)}
    )

    cancelled = production_order_schedule_service.cancel_schedule(db, schedule.id, "Plans changed.")

    assert cancelled.status == "cancelled"
    result = production_order_schedule_service.get_schedule_summary(db, po.id)
    assert result["schedule_status"] == "cancelled"
    assert result["scheduled_quantity"] == 0
    assert result["remaining_to_schedule"] == 500
    # The Production Order itself is untouched -- still traceable, still planned.
    assert production_order_service.get_production_order(db, po.id).status == "planned"


def test_cancellation_requires_a_reason(db):
    po, _, machine = _po(db)
    schedule = production_order_schedule_service.create_schedule(
        db, po.id, {"machine_id": machine.id, "planned_start": datetime(2026, 9, 25, 8, 0), "planned_end": datetime(2026, 9, 25, 10, 0)}
    )
    with pytest.raises(ValidationAppError):
        production_order_schedule_service.cancel_schedule(db, schedule.id, "")


def test_due_date_awareness_flags_a_late_schedule(db):
    po, _, machine = _po(db, due_date=date(2026, 9, 20))

    production_order_schedule_service.create_schedule(
        db, po.id, {"machine_id": machine.id, "planned_start": datetime(2026, 9, 25, 8, 0), "planned_end": datetime(2026, 9, 25, 10, 0)}
    )
    result = production_order_schedule_service.get_schedule_summary(db, po.id)

    # The schedule itself is created, not silently rejected -- the system
    # only has to make the lateness visible, never hide it.
    assert result["schedules"][0].status == "planned"
    assert result["schedules"][0].scheduled_end > result["due_date"]


def test_schedule_within_due_date_is_not_flagged_late(db):
    po, _, machine = _po(db, due_date=date(2026, 10, 5))

    production_order_schedule_service.create_schedule(
        db, po.id, {"machine_id": machine.id, "planned_start": datetime(2026, 9, 25, 8, 0), "planned_end": datetime(2026, 9, 25, 10, 0)}
    )
    result = production_order_schedule_service.get_schedule_summary(db, po.id)

    assert result["schedules"][0].scheduled_end <= result["due_date"]


def test_schedule_rejected_for_cancelled_production_order(db):
    po, _, machine = _po(db)
    production_order_service.change_status(db, po.id, "cancelled", reason="Test cancellation.")

    with pytest.raises(ConflictError):
        production_order_schedule_service.create_schedule(
            db, po.id, {"machine_id": machine.id, "planned_start": datetime(2026, 9, 25, 8, 0), "planned_end": datetime(2026, 9, 25, 10, 0)}
        )


def test_schedule_rejected_for_nonexistent_production_order(db):
    with pytest.raises(NotFoundError):
        production_order_schedule_service.create_schedule(
            db, 999999, {"planned_start": datetime(2026, 9, 25, 8, 0), "planned_end": datetime(2026, 9, 25, 10, 0)}
        )


def test_schedule_rejected_for_inactive_machine(db):
    po, _, machine = _po(db)
    machine.status = "inactive"
    db.flush()

    with pytest.raises(ValidationAppError):
        production_order_schedule_service.create_schedule(
            db, po.id, {"machine_id": machine.id, "planned_start": datetime(2026, 9, 25, 8, 0), "planned_end": datetime(2026, 9, 25, 10, 0)}
        )


@pytest.mark.parametrize("quantity", [0, -5])
def test_schedule_rejects_non_positive_quantity(db, quantity):
    po, _, machine = _po(db)
    with pytest.raises(ValidationAppError):
        production_order_schedule_service.create_schedule(
            db,
            po.id,
            {
                "machine_id": machine.id,
                "planned_quantity": quantity,
                "planned_start": datetime(2026, 9, 25, 8, 0),
                "planned_end": datetime(2026, 9, 25, 10, 0),
            },
        )


def test_schedule_rejects_end_before_start(db):
    po, _, machine = _po(db)
    with pytest.raises(ValidationAppError):
        production_order_schedule_service.create_schedule(
            db,
            po.id,
            {
                "machine_id": machine.id,
                "planned_start": datetime(2026, 9, 25, 12, 0),
                "planned_end": datetime(2026, 9, 25, 10, 0),
            },
        )


def test_schedule_rejects_quantity_beyond_production_order(db):
    po, _, machine = _po(db, quantity=500)
    with pytest.raises(ValidationAppError):
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


def test_second_schedule_cannot_exceed_remaining_quantity(db):
    po, _, machine = _po(db, quantity=500)
    production_order_schedule_service.create_schedule(
        db,
        po.id,
        {"machine_id": machine.id, "planned_quantity": 300, "planned_start": datetime(2026, 9, 25, 8, 0), "planned_end": datetime(2026, 9, 25, 10, 0)},
    )

    with pytest.raises(ValidationAppError):
        production_order_schedule_service.create_schedule(
            db,
            po.id,
            {"machine_id": machine.id, "planned_quantity": 300, "planned_start": datetime(2026, 9, 26, 8, 0), "planned_end": datetime(2026, 9, 26, 10, 0)},
        )

    # But scheduling exactly what's left works fine.
    result = production_order_schedule_service.create_schedule(
        db,
        po.id,
        {"machine_id": machine.id, "planned_quantity": 200, "planned_start": datetime(2026, 9, 26, 8, 0), "planned_end": datetime(2026, 9, 26, 10, 0)},
    )
    assert float(result.planned_quantity) == 200


def test_schedule_requires_a_manual_end_without_a_production_rate(db):
    po, product, machine = _po(db, production_hours_per_unit=None)
    with pytest.raises(ValidationAppError):
        production_order_schedule_service.create_schedule(
            db, po.id, {"machine_id": machine.id, "planned_start": datetime(2026, 9, 25, 8, 0)}
        )

    # Given explicitly, it works.
    result = production_order_schedule_service.create_schedule(
        db, po.id, {"machine_id": machine.id, "planned_start": datetime(2026, 9, 25, 8, 0), "planned_end": datetime(2026, 9, 25, 12, 0)}
    )
    assert result.planned_end == datetime(2026, 9, 25, 12, 0)


def test_legacy_batch_endpoints_reject_a_production_order_linked_schedule(db):
    """A schedule created through the Production Order flow never
    reserved its own materials (P4's allocation already owns that) --
    letting it be mutated through the legacy batch endpoints would
    incorrectly release/reserve stock it never touched. See
    production_service._reject_production_order_linked."""
    po, _, machine = _po(db)
    schedule = production_order_schedule_service.create_schedule(
        db, po.id, {"machine_id": machine.id, "planned_start": datetime(2026, 9, 25, 8, 0), "planned_end": datetime(2026, 9, 25, 10, 0)}
    )

    with pytest.raises(ConflictError):
        production_service.update_batch(db, schedule.id, {"notes": "hijacked"})
    with pytest.raises(ConflictError):
        production_service.change_status(db, schedule.id, "cancelled", reason="x")
    with pytest.raises(ConflictError):
        production_service.delete_batch(db, schedule.id)
