"""Regression tests for production_service's batch lifecycle -- in
particular the pause/resume + partial-output recording added alongside
the production-maturity pass (log_partial_production, and change_status's
'paused' handling), and the reservation-release correctness that had to
change to support it: a batch that's had some of its output already
recorded must release only what's actually left over, whether it's
finally completed or cancelled, never the batch's full original
reservation twice over.
"""

from datetime import datetime, timedelta, timezone

import pytest

from app.core.exceptions import ConflictError, ValidationAppError
from app.services import inventory_service, production_service, settings_service

from .factories import make_bom, make_bom_line, make_machine, make_product, make_raw_material, set_stock

TODAY = datetime.now(timezone.utc).date()


def _next_working_day(db):
    """The readiness/capacity gate zeroes out a non-working day's
    capacity regardless of how high capacity_hours_per_day is set (see
    capacity_service.capacity_available_in_window) -- a batch meant to
    actually be startable in a test must land on a real working day, not
    just "tomorrow" by the calendar, or it fails on whichever real-world
    weekday the suite happens to run on."""
    return settings_service.next_working_day(TODAY, settings_service.get_working_days(db))


def _ready_batch(db, planned_quantity=10, bom_quantity_per_unit=2, stock=1000):
    """A batch that can actually start: a BOM requiring
    bom_quantity_per_unit of one raw material per unit of output, ample
    stock and machine capacity, no scrap (so net == planned-required and
    discrepancy math is easy to reason about in a test)."""
    machine = make_machine(db, capacity_hours_per_day=800)
    material = make_raw_material(db)
    product = make_product(db, machine_id=machine.id, production_hours_per_unit=1)
    make_bom(db, product.id, output_quantity=1)
    make_bom_line(db, product.id, "raw_material", material.id, quantity=bom_quantity_per_unit, scrap_percent=0)
    set_stock(db, material.id, stock)

    start = _next_working_day(db)
    batch = production_service.create_batch(
        db,
        {
            "product_id": product.id,
            "planned_quantity": planned_quantity,
            "scheduled_start": start,
            "scheduled_end": start,
            "machine_id": machine.id,
        },
    )
    batch = production_service.change_status(db, batch.id, "in_progress")
    return batch, material


def _reserved(db, material_id) -> float:
    return inventory_service.get_stock(db, "raw_material", material_id)["quantity_reserved"]


def _on_hand(db, material_id) -> float:
    return inventory_service.get_stock(db, "raw_material", material_id)["quantity_on_hand"]


def test_pause_then_resume_preserves_state(db):
    batch, _material = _ready_batch(db)
    original_actual_start = batch.actual_start

    paused = production_service.change_status(db, batch.id, "paused", reason="Machine breakdown")
    assert paused.status == "paused"
    assert paused.pause_reason == "Machine breakdown"
    assert paused.actual_start == original_actual_start  # untouched by pausing

    resumed = production_service.change_status(db, batch.id, "in_progress")
    assert resumed.status == "in_progress"


def test_pause_without_reason_is_rejected(db):
    batch, _material = _ready_batch(db)
    with pytest.raises(ValidationAppError):
        production_service.change_status(db, batch.id, "paused")


def test_log_partial_production_consumes_and_releases_proportionally(db):
    batch, material = _ready_batch(db, planned_quantity=10, bom_quantity_per_unit=2, stock=1000)
    reserved_before = _reserved(db, material.id)  # 10 * 2 = 20
    on_hand_before = _on_hand(db, material.id)

    updated = production_service.log_partial_production(db, batch.id, 6)

    assert updated.status == "in_progress"  # logging alone doesn't change status
    assert float(updated.produced_quantity) == 6
    # 6 units worth (12) consumed from on-hand and released from reserve;
    # the remaining 4 units' worth (8) stays reserved.
    assert _on_hand(db, material.id) == on_hand_before - 12
    assert _reserved(db, material.id) == reserved_before - 12


def test_log_partial_production_rejected_off_in_progress_or_paused(db):
    machine = make_machine(db, capacity_hours_per_day=800)
    material = make_raw_material(db)
    product = make_product(db, machine_id=machine.id, production_hours_per_unit=1)
    make_bom(db, product.id, output_quantity=1)
    make_bom_line(db, product.id, "raw_material", material.id, quantity=1)
    set_stock(db, material.id, 100)
    start = TODAY + timedelta(days=1)
    still_planned = production_service.create_batch(
        db,
        {
            "product_id": product.id,
            "planned_quantity": 5,
            "scheduled_start": start,
            "scheduled_end": start,
            "machine_id": machine.id,
        },
    )

    with pytest.raises(ConflictError):
        production_service.log_partial_production(db, still_planned.id, 1)


def test_complete_after_partial_logs_covers_the_remainder(db):
    batch, material = _ready_batch(db, planned_quantity=10, bom_quantity_per_unit=2, stock=1000)
    reserved_before = _reserved(db, material.id)

    production_service.log_partial_production(db, batch.id, 6)
    completed = production_service.change_status(db, batch.id, "completed", produced_quantity=4)

    assert completed.status == "completed"
    assert float(completed.produced_quantity) == 10
    assert completed.actual_end is not None
    # Everything originally reserved for this batch is gone -- none left
    # dangling, none released twice (which would show as *less* than
    # reserved_before - 20 if double-released against other batches, but
    # more simply: it should land exactly back at the pre-batch baseline).
    assert _reserved(db, material.id) == reserved_before - 20


def test_closing_out_early_forfeits_remaining_reservation(db):
    """Pausing after partial output, then completing with nothing further
    to add, closes the batch out at whatever was actually produced -- and
    releases the reservation for the part that will now never be made."""
    batch, material = _ready_batch(db, planned_quantity=10, bom_quantity_per_unit=2, stock=1000)
    reserved_before = _reserved(db, material.id)

    production_service.log_partial_production(db, batch.id, 6)
    production_service.change_status(db, batch.id, "paused", reason="Line reassigned to a rush order")
    completed = production_service.change_status(db, batch.id, "completed")

    assert completed.status == "completed"
    assert float(completed.produced_quantity) == 6  # never produced the rest
    # The partial log already released 6 units' worth (12); closing out
    # early releases the remaining 4 units' worth (8) too, on top of
    # that -- the full original reservation (20) is gone, none left
    # dangling for units that will now never be made.
    assert _reserved(db, material.id) == reserved_before - 20


def test_completing_with_nothing_ever_produced_is_rejected(db):
    batch, _material = _ready_batch(db)
    with pytest.raises(ValidationAppError):
        production_service.change_status(db, batch.id, "completed")


def test_cancel_after_partial_production_releases_only_the_remainder(db):
    batch, material = _ready_batch(db, planned_quantity=10, bom_quantity_per_unit=2, stock=1000)
    reserved_before = _reserved(db, material.id)
    on_hand_before = _on_hand(db, material.id)

    production_service.log_partial_production(db, batch.id, 6)
    cancelled = production_service.change_status(db, batch.id, "cancelled", reason="Rest of the run scrapped")

    assert cancelled.status == "cancelled"
    # The 6 already produced stay produced -- their material consumption
    # and finished-goods receipt are not reversed by cancelling the rest.
    assert _on_hand(db, material.id) == on_hand_before - 12
    # The partial log already released 6 units' worth (12); cancelling
    # releases the remaining 4 units' worth (8) too -- the full original
    # reservation (20) is gone, none left dangling on a cancelled batch.
    assert _reserved(db, material.id) == reserved_before - 20


def test_discrepancy_findings_accumulate_across_rounds(db):
    machine = make_machine(db, capacity_hours_per_day=800)
    material = make_raw_material(db)
    product = make_product(db, machine_id=machine.id, production_hours_per_unit=1)
    make_bom(db, product.id, output_quantity=1)
    # net_required per unit = 2, zero scrap allowance -- reporting less
    # than net_required for either round is a "discrepancy" finding.
    make_bom_line(db, product.id, "raw_material", material.id, quantity=2, scrap_percent=0)
    set_stock(db, material.id, 1000)

    start = _next_working_day(db)
    batch = production_service.create_batch(
        db,
        {
            "product_id": product.id,
            "planned_quantity": 10,
            "scheduled_start": start,
            "scheduled_end": start,
            "machine_id": machine.id,
        },
    )
    batch = production_service.change_status(db, batch.id, "in_progress")

    # Round 1: 5 units need net 10; report only 8 -- a discrepancy.
    production_service.log_partial_production(
        db, batch.id, 5, actual_materials=[{"raw_material_id": material.id, "quantity_used": 8}]
    )
    # Round 2 (final): 5 units need net 10; report only 7 -- another discrepancy.
    completed = production_service.change_status(
        db,
        batch.id,
        "completed",
        produced_quantity=5,
        actual_materials=[{"raw_material_id": material.id, "quantity_used": 7}],
    )

    assert completed.material_discrepancy_flag is True
    import json

    findings = json.loads(completed.material_discrepancy_notes)
    assert len(findings) == 2  # both rounds' findings kept, not just the last


def test_escalate_overdue_batches_flags_planned_and_in_progress_past_scheduled_end(db):
    machine = make_machine(db, capacity_hours_per_day=800)
    material = make_raw_material(db)
    product = make_product(db, machine_id=machine.id, production_hours_per_unit=1)
    make_bom(db, product.id, output_quantity=1)
    make_bom_line(db, product.id, "raw_material", material.id, quantity=1)
    set_stock(db, material.id, 100)

    yesterday = TODAY - timedelta(days=1)
    still_planned = production_service.create_batch(
        db,
        {
            "product_id": product.id,
            "planned_quantity": 1,
            "scheduled_start": yesterday - timedelta(days=1),
            "scheduled_end": yesterday,
            "machine_id": machine.id,
        },
    )
    # Not overdue -- scheduled end is still ahead.
    not_yet_due = production_service.create_batch(
        db,
        {
            "product_id": product.id,
            "planned_quantity": 1,
            "scheduled_start": TODAY + timedelta(days=1),
            "scheduled_end": TODAY + timedelta(days=1),
            "machine_id": machine.id,
        },
    )

    flagged = production_service.escalate_overdue_batches(db, as_of=TODAY)

    flagged_ids = {b.id for b in flagged}
    assert still_planned.id in flagged_ids
    assert not_yet_due.id not in flagged_ids

    refreshed = production_service.get_batch(db, still_planned.id)
    assert refreshed.admin_review_required is True

    # Idempotent -- re-running doesn't re-flag (or duplicate-audit) what's
    # already flagged.
    again = production_service.escalate_overdue_batches(db, as_of=TODAY)
    assert still_planned.id not in {b.id for b in again}


def test_escalate_overdue_batches_skips_completed_and_cancelled(db):
    machine = make_machine(db, capacity_hours_per_day=800)
    material = make_raw_material(db)
    product = make_product(db, machine_id=machine.id, production_hours_per_unit=1)
    make_bom(db, product.id, output_quantity=1)
    make_bom_line(db, product.id, "raw_material", material.id, quantity=1)
    set_stock(db, material.id, 100)

    yesterday = TODAY - timedelta(days=1)
    batch = production_service.create_batch(
        db,
        {
            "product_id": product.id,
            "planned_quantity": 1,
            "scheduled_start": yesterday,
            "scheduled_end": yesterday,
            "machine_id": machine.id,
        },
    )
    production_service.change_status(db, batch.id, "in_progress")
    production_service.change_status(db, batch.id, "completed", produced_quantity=1)

    flagged = production_service.escalate_overdue_batches(db, as_of=TODAY)

    assert batch.id not in {b.id for b in flagged}


def test_admin_review_clears_the_flag(db):
    machine = make_machine(db, capacity_hours_per_day=800)
    material = make_raw_material(db)
    product = make_product(db, machine_id=machine.id, production_hours_per_unit=1)
    make_bom(db, product.id, output_quantity=1)
    make_bom_line(db, product.id, "raw_material", material.id, quantity=1)
    set_stock(db, material.id, 100)

    yesterday = TODAY - timedelta(days=1)
    batch = production_service.create_batch(
        db,
        {
            "product_id": product.id,
            "planned_quantity": 1,
            "scheduled_start": yesterday,
            "scheduled_end": yesterday,
            "machine_id": machine.id,
        },
    )
    production_service.escalate_overdue_batches(db, as_of=TODAY)

    reviewed = production_service.admin_review(db, batch.id, "Supplier delay, rescheduled.")
    assert reviewed.admin_review_required is False
    assert reviewed.admin_review_notes == "Supplier delay, rescheduled."


def test_admin_review_without_pending_review_is_rejected(db):
    machine = make_machine(db, capacity_hours_per_day=800)
    material = make_raw_material(db)
    product = make_product(db, machine_id=machine.id, production_hours_per_unit=1)
    make_bom(db, product.id, output_quantity=1)
    make_bom_line(db, product.id, "raw_material", material.id, quantity=1)
    set_stock(db, material.id, 100)

    batch = production_service.create_batch(
        db,
        {
            "product_id": product.id,
            "planned_quantity": 1,
            "scheduled_start": TODAY + timedelta(days=1),
            "scheduled_end": TODAY + timedelta(days=1),
            "machine_id": machine.id,
        },
    )
    with pytest.raises(ConflictError):
        production_service.admin_review(db, batch.id, "Nothing to review.")
