"""Pass 5 (Production Experience) regression tests: a Production-Order-
linked ProductionSchedule row's own status/produced_quantity never
advance past 'planned'/0 on their own (see production_execution_service.
get_effective_schedule_state's own docstring) -- these tests verify that
MRP, the Production Report, and the dashboard's production stats each
still see a Production-Order-driven batch's real progress correctly,
instead of the stale ProductionSchedule columns.
"""

from datetime import date, datetime

from app.core.timezone import today_kuwait
from app.services import (
    dashboard_service,
    mrp_service,
    production_execution_service,
    production_order_material_service,
    production_order_schedule_service,
    production_order_service,
    report_service,
)

from .factories import make_bom, make_bom_line, make_customer, make_machine, make_order, make_product, make_production_order, make_raw_material, set_stock

DUE = date(2026, 12, 1)


def _completed_po_batch(db, quantity: float = 100):
    """A Production Order fully produced (and QC still pending -- QC
    release is a separate concern from these consumers) through the real
    start_execution/complete_execution service calls, scheduled today so
    date-windowed report/dashboard figures land in the current bucket."""
    today = today_kuwait()
    customer = make_customer(db)
    machine = make_machine(db)
    material = make_raw_material(db)
    product = make_product(db, machine_id=machine.id, production_hours_per_unit=0.001)
    make_bom(db, product.id, output_quantity=1)
    make_bom_line(db, product.id, "raw_material", material.id, quantity=1, scrap_percent=0)
    set_stock(db, material.id, 10_000)

    order = make_order(
        db, customer.id, lines=[{"product_id": product.id, "quantity": quantity, "unit_price": 10}], status="confirmed"
    )
    po = make_production_order(db, order.id, order.lines[0].id, product.id, quantity, DUE)
    production_order_material_service.calculate(db, po.id)
    requirement = production_order_material_service.get_requirements(db, po.id)[0]
    production_order_material_service.allocate(db, po.id, requirement.id, quantity)

    schedule = production_order_schedule_service.create_schedule(
        db,
        po.id,
        {
            "machine_id": machine.id,
            "planned_start": datetime.combine(today, datetime.min.time()).replace(hour=8),
            "planned_end": datetime.combine(today, datetime.min.time()).replace(hour=20),
        },
    )
    execution = production_execution_service.start_execution(db, po.id, schedule.id)
    production_execution_service.complete_execution(db, execution.id, quantity)

    return po, schedule, product, material


def test_effective_schedule_state_reflects_real_execution_progress(db):
    po, schedule, product, material = _completed_po_batch(db, quantity=100)

    # Before the fix, the schedule's own columns are what a naive reader
    # would see -- still 'planned', still produced_quantity=0, despite
    # production having actually completed.
    db.refresh(schedule)
    assert schedule.status == "planned"
    assert float(schedule.produced_quantity) == 0.0

    effective = production_execution_service.get_effective_schedule_state(db, [schedule])
    assert effective[schedule.id]["status"] == "completed"
    assert effective[schedule.id]["produced_quantity"] == 100.0


def test_mrp_does_not_recount_a_fully_produced_production_order_batch(db):
    po, schedule, product, material = _completed_po_batch(db, quantity=100)

    requirements = mrp_service.compute_requirements(db)
    material_ids = {r["raw_material_id"] for r in requirements}
    assert material.id not in material_ids, (
        "MRP still treats this material as short after its only demand (a fully "
        "produced Production Order batch) was completed -- it's reading the "
        "schedule's own stale status/produced_quantity instead of the batch's "
        "real execution progress."
    )


def test_production_report_counts_production_order_output(db):
    po, schedule, product, material = _completed_po_batch(db, quantity=100)
    today = today_kuwait()

    report = report_service.get_production_report(db, date_from=today, date_to=today)
    completed_row = next(r for r in report["by_status"] if r["status"] == "completed")
    assert completed_row["count"] == 1
    assert completed_row["planned_quantity"] == 100.0

    top = next((p for p in report["top_products"] if p["product_id"] == product.id), None)
    assert top is not None
    assert top["produced_quantity"] == 100.0

    drilldown = report_service.get_production_drilldown(db, status="completed", product_id=product.id)
    assert any(row["id"] == schedule.id and row["produced_quantity"] == 100.0 for row in drilldown)


def test_dashboard_production_stats_count_completed_production_order_batch(db):
    po, schedule, product, material = _completed_po_batch(db, quantity=100)

    stats = dashboard_service.get_stats(db)["stats"]
    # Not left dangling in 'active' forever, and counted toward completion.
    assert stats["production_completion"]["value"] != "—"


def test_legacy_batch_behavior_is_unchanged(db):
    """A schedule with no production_order_id must pass straight through
    get_effective_schedule_state -- this fix only ever recomputes a
    Production-Order-linked row."""
    from .factories import make_production_schedule

    material = make_raw_material(db)
    machine = make_machine(db)
    product = make_product(db, machine_id=machine.id)
    make_bom(db, product.id, output_quantity=1)
    make_bom_line(db, product.id, "raw_material", material.id, quantity=1, scrap_percent=0)

    schedule = make_production_schedule(
        db, product.id, planned_quantity=50, scheduled_start=date(2026, 9, 1), scheduled_end=date(2026, 9, 2),
        status="completed", produced_quantity=50,
    )

    effective = production_execution_service.get_effective_schedule_state(db, [schedule])
    assert effective[schedule.id] == {"produced_quantity": 50.0, "status": "completed"}
