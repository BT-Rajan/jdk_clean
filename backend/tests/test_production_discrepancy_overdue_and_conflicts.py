"""Production items new in this pass: a mandatory reason when completed
output differs from planned quantity, days_overdue, the `overdue` list
filter, and machine-conflict detection. Pause/cancel reasons were
already mandatory (see test_production_service.py's own
test_pause_without_reason_is_rejected and the model's own comments).
"""

from datetime import date, timedelta

import pytest

from app.core.exceptions import ConflictError, ValidationAppError
from app.services import production_service, settings_service

from .factories import (
    make_bom,
    make_bom_line,
    make_machine,
    make_product,
    make_production_schedule,
    make_raw_material,
    set_stock,
)

TODAY = date.today()


def _next_working_day(db):
    return settings_service.next_working_day(TODAY, settings_service.get_working_days(db))


def _ready_batch(db, planned_quantity=10, scheduled_start=None, scheduled_end=None, machine=None):
    machine = machine or make_machine(db, capacity_hours_per_day=800)
    material = make_raw_material(db)
    product = make_product(db, machine_id=machine.id, production_hours_per_unit=1)
    make_bom(db, product.id, output_quantity=1)
    make_bom_line(db, product.id, "raw_material", material.id, quantity=1, scrap_percent=0)
    set_stock(db, material.id, 1000)

    start = scheduled_start or _next_working_day(db)
    end = scheduled_end or start
    batch = production_service.create_batch(
        db,
        {
            "product_id": product.id,
            "planned_quantity": planned_quantity,
            "scheduled_start": start,
            "scheduled_end": end,
            "machine_id": machine.id,
        },
    )
    return production_service.change_status(db, batch.id, "in_progress"), machine


def _planned_batch(db, planned_quantity=10, scheduled_start=None, scheduled_end=None, machine=None):
    """Same setup as _ready_batch, but left in 'planned' status -- for
    exercising create/update's own machine-conflict guard, which (like
    every other edit rule in update_batch) only applies to a batch still
    in 'planned'."""
    machine = machine or make_machine(db, capacity_hours_per_day=800)
    material = make_raw_material(db)
    product = make_product(db, machine_id=machine.id, production_hours_per_unit=1)
    make_bom(db, product.id, output_quantity=1)
    make_bom_line(db, product.id, "raw_material", material.id, quantity=1, scrap_percent=0)
    set_stock(db, material.id, 1000)

    start = scheduled_start or _next_working_day(db)
    end = scheduled_end or start
    batch = production_service.create_batch(
        db,
        {
            "product_id": product.id,
            "planned_quantity": planned_quantity,
            "scheduled_start": start,
            "scheduled_end": end,
            "machine_id": machine.id,
        },
    )
    return batch, machine


def test_completing_at_exactly_planned_quantity_needs_no_reason(db):
    batch, _machine = _ready_batch(db, planned_quantity=10)

    completed = production_service.change_status(db, batch.id, "completed", produced_quantity=10)

    assert completed.status == "completed"
    assert completed.quantity_discrepancy_reason is None


def test_completing_under_planned_quantity_requires_a_reason(db):
    batch, _machine = _ready_batch(db, planned_quantity=10)

    with pytest.raises(ValidationAppError, match="differs from planned"):
        production_service.change_status(db, batch.id, "completed", produced_quantity=6)


def test_completing_under_planned_quantity_with_a_reason_succeeds(db):
    batch, _machine = _ready_batch(db, planned_quantity=10)

    completed = production_service.change_status(
        db, batch.id, "completed", produced_quantity=6, reason="Machine breakdown partway through the run."
    )

    assert completed.status == "completed"
    assert completed.quantity_discrepancy_reason == "Machine breakdown partway through the run."


def test_days_overdue_none_when_not_past_scheduled_end(db):
    # Seeded directly, not via _ready_batch -- get_days_overdue only
    # looks at status/scheduled_end, and going through change_status's
    # own machine-capacity readiness gate would make this calendar-day
    # test's outcome depend on whether TODAY+5 happens to land on a
    # non-working day (see test_production_readiness.py's own comment on
    # that gate zeroing out non-working-day capacity).
    product = make_product(db)
    batch = make_production_schedule(
        db, product.id, 10, TODAY + timedelta(days=5), TODAY + timedelta(days=5), status="in_progress"
    )
    assert production_service.get_days_overdue(batch, today=TODAY) is None


def test_days_overdue_positive_once_past_scheduled_end(db):
    batch, _machine = _ready_batch(db, scheduled_start=TODAY - timedelta(days=3), scheduled_end=TODAY - timedelta(days=3))
    assert production_service.get_days_overdue(batch, today=TODAY) == 3


def test_days_overdue_none_once_completed(db):
    batch, _machine = _ready_batch(db, scheduled_start=TODAY - timedelta(days=3), scheduled_end=TODAY - timedelta(days=3))
    completed = production_service.change_status(db, batch.id, "completed", produced_quantity=10)
    assert production_service.get_days_overdue(completed, today=TODAY) is None


def test_list_batches_overdue_filter(db):
    # Seeded directly -- see test_days_overdue_none_when_not_past_
    # scheduled_end's own comment on why this avoids _ready_batch here.
    product = make_product(db)
    overdue_batch = make_production_schedule(
        db, product.id, 10, TODAY - timedelta(days=2), TODAY - timedelta(days=2), status="in_progress"
    )
    on_time_batch = make_production_schedule(
        db, product.id, 10, TODAY + timedelta(days=2), TODAY + timedelta(days=2), status="in_progress"
    )

    result = production_service.list_batches(db, overdue=True)
    ids = [b.id for b in result["items"]]

    assert overdue_batch.id in ids
    assert on_time_batch.id not in ids


def test_machine_conflict_detected_for_overlapping_batches_on_same_machine(db):
    # Overlapping batches can no longer be *created* through the service
    # (see test_creating_batch_on_conflicting_machine_window_is_rejected
    # below) -- this exercises get_machine_conflicts' own detection query
    # against data that predates that guard (or was seeded directly),
    # via the same direct-insert factory test_production_readiness.py's
    # own capacity tests already use.
    machine = make_machine(db, capacity_hours_per_day=800)
    material = make_raw_material(db)
    product = make_product(db, machine_id=machine.id, production_hours_per_unit=1)
    make_bom(db, product.id, output_quantity=1)
    make_bom_line(db, product.id, "raw_material", material.id, quantity=1, scrap_percent=0)
    set_stock(db, material.id, 1000)
    start = _next_working_day(db)
    end = start + timedelta(days=3)
    batch_a = make_production_schedule(db, product.id, 10, start, end, machine_id=machine.id, status="in_progress")
    batch_b = make_production_schedule(
        db,
        product.id,
        10,
        start + timedelta(days=1),
        start + timedelta(days=5),
        machine_id=machine.id,
        status="in_progress",
    )

    conflicts_a = production_service.get_machine_conflicts(db, batch_a)
    conflicts_b = production_service.get_machine_conflicts(db, batch_b)

    assert [c["id"] for c in conflicts_a] == [batch_b.id]
    assert [c["id"] for c in conflicts_b] == [batch_a.id]


def test_creating_batch_on_conflicting_machine_window_is_rejected(db):
    batch_a, machine = _planned_batch(db, scheduled_start=_next_working_day(db))

    with pytest.raises(ConflictError, match="already booked"):
        _planned_batch(db, scheduled_start=batch_a.scheduled_start, machine=machine)


def test_creating_batch_on_non_conflicting_machine_window_succeeds(db):
    batch_a, machine = _planned_batch(db, scheduled_start=_next_working_day(db))

    batch_b, _ = _planned_batch(db, scheduled_start=batch_a.scheduled_end + timedelta(days=10), machine=machine)

    assert batch_b.id != batch_a.id


def test_updating_batch_into_a_conflicting_machine_window_is_rejected(db):
    batch_a, machine = _planned_batch(db, scheduled_start=_next_working_day(db))
    batch_b, _ = _planned_batch(db, scheduled_start=batch_a.scheduled_end + timedelta(days=10), machine=machine)

    with pytest.raises(ConflictError, match="already booked"):
        production_service.update_batch(
            db, batch_b.id, {"scheduled_start": batch_a.scheduled_start, "scheduled_end": batch_a.scheduled_end}
        )


def test_no_machine_conflict_for_non_overlapping_windows(db):
    machine = make_machine(db, capacity_hours_per_day=800)
    start = _next_working_day(db)
    batch_a, _ = _ready_batch(db, scheduled_start=start, scheduled_end=start, machine=machine)
    batch_b, _ = _ready_batch(
        db, scheduled_start=start + timedelta(days=10), scheduled_end=start + timedelta(days=10), machine=machine
    )

    assert production_service.get_machine_conflicts(db, batch_a) == []
    assert production_service.get_machine_conflicts(db, batch_b) == []


def test_no_machine_conflict_once_a_batch_completes(db):
    # Seeded directly rather than through create_batch/change_status --
    # once a batch is 'completed' it's no longer a booking at all, so
    # there's nothing left for the create-time guard to have prevented;
    # this only exercises get_machine_conflicts' own status filter.
    machine = make_machine(db, capacity_hours_per_day=800)
    product = make_product(db, machine_id=machine.id)
    start = _next_working_day(db)
    make_production_schedule(db, product.id, 10, start, start, machine_id=machine.id, status="completed")
    batch_b = make_production_schedule(db, product.id, 10, start, start, machine_id=machine.id, status="in_progress")

    assert production_service.get_machine_conflicts(db, batch_b) == []
