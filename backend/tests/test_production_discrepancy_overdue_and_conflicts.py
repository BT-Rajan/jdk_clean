"""Production items new in this pass: a mandatory reason when completed
output differs from planned quantity, days_overdue, the `overdue` list
filter, and machine-conflict detection. Pause/cancel reasons were
already mandatory (see test_production_service.py's own
test_pause_without_reason_is_rejected and the model's own comments).
"""

from datetime import date, timedelta

import pytest

from app.core.exceptions import ValidationAppError
from app.services import production_service, settings_service

from .factories import make_bom, make_bom_line, make_machine, make_product, make_raw_material, set_stock

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
    batch, _machine = _ready_batch(db, scheduled_start=TODAY + timedelta(days=5), scheduled_end=TODAY + timedelta(days=5))
    assert production_service.get_days_overdue(batch, today=TODAY) is None


def test_days_overdue_positive_once_past_scheduled_end(db):
    batch, _machine = _ready_batch(db, scheduled_start=TODAY - timedelta(days=3), scheduled_end=TODAY - timedelta(days=3))
    assert production_service.get_days_overdue(batch, today=TODAY) == 3


def test_days_overdue_none_once_completed(db):
    batch, _machine = _ready_batch(db, scheduled_start=TODAY - timedelta(days=3), scheduled_end=TODAY - timedelta(days=3))
    completed = production_service.change_status(db, batch.id, "completed", produced_quantity=10)
    assert production_service.get_days_overdue(completed, today=TODAY) is None


def test_list_batches_overdue_filter(db):
    overdue_batch, _m1 = _ready_batch(
        db, scheduled_start=TODAY - timedelta(days=2), scheduled_end=TODAY - timedelta(days=2)
    )
    on_time_batch, _m2 = _ready_batch(
        db, scheduled_start=TODAY + timedelta(days=2), scheduled_end=TODAY + timedelta(days=2)
    )

    result = production_service.list_batches(db, overdue=True)
    ids = [b.id for b in result["items"]]

    assert overdue_batch.id in ids
    assert on_time_batch.id not in ids


def test_machine_conflict_detected_for_overlapping_batches_on_same_machine(db):
    machine = make_machine(db, capacity_hours_per_day=800)
    start = _next_working_day(db)
    end = start + timedelta(days=3)
    batch_a, _ = _ready_batch(db, scheduled_start=start, scheduled_end=end, machine=machine)
    batch_b, _ = _ready_batch(
        db, scheduled_start=start + timedelta(days=1), scheduled_end=start + timedelta(days=5), machine=machine
    )

    conflicts_a = production_service.get_machine_conflicts(db, batch_a)
    conflicts_b = production_service.get_machine_conflicts(db, batch_b)

    assert [c["id"] for c in conflicts_a] == [batch_b.id]
    assert [c["id"] for c in conflicts_b] == [batch_a.id]


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
    machine = make_machine(db, capacity_hours_per_day=800)
    start = _next_working_day(db)
    batch_a, _ = _ready_batch(db, scheduled_start=start, scheduled_end=start, machine=machine)
    batch_b, _ = _ready_batch(db, scheduled_start=start, scheduled_end=start, machine=machine)

    production_service.change_status(db, batch_a.id, "completed", produced_quantity=10)

    assert production_service.get_machine_conflicts(db, batch_b) == []
