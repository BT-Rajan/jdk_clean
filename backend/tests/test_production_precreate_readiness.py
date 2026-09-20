"""production_service.check_readiness_for_candidate_batch (and its
GET /api/production-schedules/check-readiness route) -- the same
materials/machine/worker readiness breakdown an existing batch's own
/{batch_id}/readiness endpoint returns, but for a batch that doesn't
exist yet, so the "New batch" form can show machine availability and
worker requirement vs. available *before* the schedule is committed.
"""

from datetime import timedelta

import pytest

from app.core.exceptions import ValidationAppError
from app.services import production_service, settings_service

from .factories import (
    make_bom,
    make_bom_line,
    make_machine,
    make_product,
    make_raw_material,
    set_factory_labor_pool,
    set_stock,
)


def _next_working_day(db, today):
    return settings_service.next_working_day(today, settings_service.get_working_days(db))


def test_candidate_readiness_ready_when_everything_available(db):
    from datetime import date

    today = date.today()
    machine = make_machine(db, capacity_hours_per_day=800)
    material = make_raw_material(db)
    product = make_product(db, machine_id=machine.id, production_hours_per_unit=1)
    make_bom(db, product.id, output_quantity=1)
    make_bom_line(db, product.id, "raw_material", material.id, quantity=1, scrap_percent=0)
    set_stock(db, material.id, 1000)

    start = _next_working_day(db, today)
    result = production_service.check_readiness_for_candidate_batch(
        db, product.id, 10, scheduled_start=start, scheduled_end=start
    )

    assert result["status"] == "READY"
    assert result["materials"][0]["shortage"] == 0
    assert result["machine"]["ok"] is True


def test_candidate_readiness_flags_material_shortage(db):
    material = make_raw_material(db)
    product = make_product(db)
    make_bom(db, product.id, output_quantity=1)
    make_bom_line(db, product.id, "raw_material", material.id, quantity=10)
    set_stock(db, material.id, 0)

    result = production_service.check_readiness_for_candidate_batch(db, product.id, 5)

    assert result["status"] == "MATERIAL_SHORTAGE"
    assert result["materials"][0]["shortage"] > 0


def test_candidate_readiness_flags_worker_shortage(db):
    from datetime import date

    today = date.today()
    material = make_raw_material(db)
    product = make_product(db, production_hours_per_unit=1, workers_required=5)
    make_bom(db, product.id, output_quantity=1)
    make_bom_line(db, product.id, "raw_material", material.id, quantity=1, scrap_percent=0)
    set_stock(db, material.id, 1000)
    set_factory_labor_pool(db, total_workers=1, workday_hours=8)

    start = _next_working_day(db, today)
    result = production_service.check_readiness_for_candidate_batch(
        db, product.id, 100, scheduled_start=start, scheduled_end=start
    )

    assert result["workers"]["ok"] is False
    assert result["status"] in ("WORKER_SHORTAGE", "MULTIPLE_ISSUES")


def test_candidate_readiness_uses_products_own_machine_when_none_given(db):
    from datetime import date

    today = date.today()
    machine = make_machine(db, capacity_hours_per_day=1)
    material = make_raw_material(db)
    product = make_product(db, machine_id=machine.id, production_hours_per_unit=100)
    make_bom(db, product.id, output_quantity=1)
    make_bom_line(db, product.id, "raw_material", material.id, quantity=1, scrap_percent=0)
    set_stock(db, material.id, 1000)

    start = _next_working_day(db, today)
    result = production_service.check_readiness_for_candidate_batch(
        db, product.id, 10, scheduled_start=start, scheduled_end=start
    )

    assert result["machine"]["machine_id"] == machine.id
    assert result["machine"]["ok"] is False


def test_candidate_readiness_no_active_bom(db):
    product = make_product(db)

    result = production_service.check_readiness_for_candidate_batch(db, product.id, 10)

    assert result["status"] == "NO_ACTIVE_BOM"


def test_candidate_readiness_unknown_product_is_rejected(db):
    with pytest.raises(ValidationAppError):
        production_service.check_readiness_for_candidate_batch(db, 999999, 10)
