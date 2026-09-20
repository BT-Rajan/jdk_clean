"""Regression tests for the production-start safety gate: a batch
cannot transition to 'in_progress' unless production_service.
change_status's fresh, server-side production_readiness_service.
check_batch_readiness call passes -- Priority 4 from the test brief.
"""

from datetime import datetime, timedelta, timezone

import pytest

from app.core.exceptions import ConflictError
from app.services import production_service, settings_service

from .factories import (
    make_alternative,
    make_bom,
    make_bom_line,
    make_machine,
    make_product,
    make_production_schedule,
    make_raw_material,
    set_factory_labor_pool,
    set_stock,
)

TODAY = datetime.now(timezone.utc).date()


def _next_working_day(db):
    """See test_production_service.py's identical helper -- the
    readiness/capacity gate zeroes out a non-working day's capacity
    regardless of capacity_hours_per_day, so a batch meant to actually
    be startable must land on a real working day, not just "tomorrow"."""
    return settings_service.next_working_day(TODAY, settings_service.get_working_days(db))


def _create_batch(db, product_id, planned_quantity=1, machine_id=None, start_offset=1, duration=1):
    start = TODAY
    for _ in range(start_offset):
        start = settings_service.next_working_day(start, settings_service.get_working_days(db))
    end = start + timedelta(days=duration - 1)
    return production_service.create_batch(
        db,
        {
            "product_id": product_id,
            "planned_quantity": planned_quantity,
            "scheduled_start": start,
            "scheduled_end": end,
            "machine_id": machine_id,
        },
    )


def test_insufficient_material_blocks_start(db):
    material = make_raw_material(db)
    product = make_product(db)
    make_bom(db, product.id, output_quantity=1)
    make_bom_line(db, product.id, "raw_material", material.id, quantity=10)
    set_stock(db, material.id, 0)  # nowhere near the 10 needed

    batch = _create_batch(db, product.id, planned_quantity=1)

    with pytest.raises(ConflictError):
        production_service.change_status(db, batch.id, "in_progress")


def test_machine_capacity_failure_blocks_start(db):
    machine = make_machine(db, capacity_hours_per_day=8)
    material = make_raw_material(db)
    product = make_product(db, machine_id=machine.id, production_hours_per_unit=8)
    make_bom(db, product.id, output_quantity=1)
    make_bom_line(db, product.id, "raw_material", material.id, quantity=1)
    set_stock(db, material.id, 100)  # materials never the issue here

    window_start = _next_working_day(db)
    # Both seeded directly, not via create_batch -- two overlapping
    # bookings on one machine can no longer be *created* through the
    # service at all (production_service._assert_no_machine_conflict),
    # so this is what such capacity-exceeding data would have to look
    # like if it predates that guard; the readiness/capacity gate below
    # is still expected to catch it independently, defense in depth.
    make_production_schedule(
        db, product_id=product.id, machine_id=machine.id, planned_quantity=1,
        scheduled_start=window_start, scheduled_end=window_start,
    )
    batch = make_production_schedule(
        db, product_id=product.id, machine_id=machine.id, planned_quantity=1,
        scheduled_start=window_start, scheduled_end=window_start,
    )

    with pytest.raises(ConflictError):
        production_service.change_status(db, batch.id, "in_progress")


def test_worker_capacity_failure_blocks_start(db):
    set_factory_labor_pool(db, total_workers=2, workday_hours=8)
    machine_a = make_machine(db, capacity_hours_per_day=800)  # ample -- not the constraint under test
    machine_b = make_machine(db, capacity_hours_per_day=800)
    material_a = make_raw_material(db)
    material_b = make_raw_material(db)
    other_product = make_product(db, machine_id=machine_a.id, production_hours_per_unit=8, workers_required=2)
    product = make_product(db, machine_id=machine_b.id, production_hours_per_unit=8, workers_required=2)
    for p, m in ((other_product, material_a), (product, material_b)):
        make_bom(db, p.id, output_quantity=1)
        make_bom_line(db, p.id, "raw_material", m.id, quantity=1)
        set_stock(db, m.id, 100)

    window_start = _next_working_day(db)
    # Someone else already has the entire worker pool booked that day
    # (2 workers required * 8h = the whole 2-worker/8h-day pool).
    make_production_schedule(
        db, product_id=other_product.id, machine_id=machine_a.id, planned_quantity=1,
        scheduled_start=window_start, scheduled_end=window_start,
    )

    batch = _create_batch(db, product.id, planned_quantity=1, machine_id=machine_b.id, start_offset=1, duration=1)

    with pytest.raises(ConflictError):
        production_service.change_status(db, batch.id, "in_progress")


def test_ready_batch_can_start(db):
    machine = make_machine(db, capacity_hours_per_day=800)
    material = make_raw_material(db)
    product = make_product(db, machine_id=machine.id, production_hours_per_unit=1)
    make_bom(db, product.id, output_quantity=1)
    make_bom_line(db, product.id, "raw_material", material.id, quantity=1)
    set_stock(db, material.id, 100)

    batch = _create_batch(db, product.id, planned_quantity=1, machine_id=machine.id)

    started = production_service.change_status(db, batch.id, "in_progress")

    assert started.status == "in_progress"


def test_approved_alternative_does_not_auto_pass_readiness(db):
    """Production readiness never auto-substitutes an approved
    alternative -- a material shortage still blocks the start gate even
    when an alternative with ample stock exists, exactly as before this
    round of passes (which only changed Feasibility, not Production
    Readiness)."""
    material = make_raw_material(db)
    alternative = make_raw_material(db)
    product = make_product(db)
    make_bom(db, product.id, output_quantity=1)
    make_bom_line(db, product.id, "raw_material", material.id, quantity=10)
    set_stock(db, material.id, 0)
    set_stock(db, alternative.id, 1000)
    make_alternative(db, material.id, alternative.id, status="approved")

    batch = _create_batch(db, product.id, planned_quantity=1)

    with pytest.raises(ConflictError):
        production_service.change_status(db, batch.id, "in_progress")
