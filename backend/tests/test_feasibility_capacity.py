"""Regression tests for how feasibility_service composes the existing
capacity scan (capacity_service.find_vacant_slot_completion) with a
material-availability floor (Pass 3) -- Priority 3 from the test brief.
Products here always have a machine/time formula, unlike
test_feasibility_service.py's material-only products.
"""

from datetime import datetime, timedelta, timezone

from app.services import feasibility_service

from .factories import (
    make_bom,
    make_bom_line,
    make_customer,
    make_machine,
    make_product,
    make_production_schedule,
    make_raw_material,
    make_supplier,
    make_supplier_material,
    set_factory_labor_pool,
    set_stock,
)

TODAY = datetime.now(timezone.utc).date()


def _check(db, product_id, quantity=1):
    customer = make_customer(db)
    feasibility = feasibility_service.create_feasibility(
        db,
        {"customer_id": customer.id, "required_by_date": None, "lines": [{"product_id": product_id, "quantity": quantity}]},
    )
    checked = feasibility_service.run_check(db, feasibility.id)
    return checked.lines[0]  # raw ORM line -- these tests only need estimated_ready_date/capacity_ok, no *_json parsing


def _product_with_formula(db, machine=None, production_hours_per_unit=0.01, workers_required=None):
    """A product with an ample, essentially-always-free machine (tiny
    hours/unit, large daily capacity) -- so in the absence of a material
    floor or bookings, capacity would be available immediately."""
    if machine is None:
        machine = make_machine(db, capacity_hours_per_day=800)
    return make_product(
        db,
        machine_id=machine.id,
        production_hours_per_unit=production_hours_per_unit,
        workers_required=workers_required,
    ), machine


def test_case_a_material_later_than_machine(db):
    """A. Machine is available immediately; a material needs 10 days of
    procurement -> final ready date is the material constraint (10 days
    out), not the machine's own (earlier) availability."""
    product, machine = _product_with_formula(db)
    material = make_raw_material(db)
    make_bom(db, product.id, output_quantity=1)
    make_bom_line(db, product.id, "raw_material", material.id, quantity=100)
    set_stock(db, material.id, 0)
    supplier = make_supplier(db)
    make_supplier_material(db, supplier.id, material.id, lead_time_days=10, max_supply_quantity=1000)

    line = _check(db, product.id)

    assert line.estimated_ready_date == TODAY + timedelta(days=10)


def test_case_b_machine_later_than_material(db):
    """B. Material is available almost immediately (1 day lead time);
    the machine is fully booked for the next 10 days -> final ready date
    is the machine constraint, not the (earlier) material date."""
    product, machine = _product_with_formula(db, production_hours_per_unit=4)
    material = make_raw_material(db)
    make_bom(db, product.id, output_quantity=1)
    make_bom_line(db, product.id, "raw_material", material.id, quantity=100)
    set_stock(db, material.id, 0)
    supplier = make_supplier(db)
    make_supplier_material(db, supplier.id, material.id, lead_time_days=1, max_supply_quantity=1000)

    # Fully book the machine for the next 10 days so it has zero spare
    # capacity until day 11 regardless of the material date.
    for i in range(10):
        make_production_schedule(
            db,
            product_id=product.id,
            machine_id=machine.id,
            planned_quantity=200,  # 200 * 4h/unit = 800h -- exactly the day's full 800h capacity
            scheduled_start=TODAY + timedelta(days=i + 1),
            scheduled_end=TODAY + timedelta(days=i + 1),
        )

    line = _check(db, product.id)

    assert line.estimated_ready_date is not None
    assert line.estimated_ready_date > TODAY + timedelta(days=1)  # later than the material date alone
    assert line.estimated_ready_date >= TODAY + timedelta(days=11)


def test_case_c_worker_constraint(db):
    """C. The shared worker pool, not just the machine, continues to
    constrain the final date: a product needing more workers than the
    factory has for this batch's duration pushes the date out even with
    a fully free machine and materials in stock."""
    set_factory_labor_pool(db, total_workers=2, workday_hours=8)
    product, machine = _product_with_formula(db, production_hours_per_unit=8, workers_required=2)
    material = make_raw_material(db)
    make_bom(db, product.id, output_quantity=1)
    make_bom_line(db, product.id, "raw_material", material.id, quantity=1)
    set_stock(db, material.id, 100)  # materials never a blocker here

    other_product, _ = _product_with_formula(db, machine=make_machine(db, capacity_hours_per_day=800), workers_required=2)
    # Someone else already has the entire worker pool booked tomorrow.
    make_production_schedule(
        db,
        product_id=other_product.id,
        machine_id=other_product.machine_id,
        planned_quantity=8,  # 8 units * 8h * 2 workers = 128 worker-hours == the whole pool's day (2 workers * 8h * 8 = wait, see below)
        scheduled_start=TODAY + timedelta(days=1),
        scheduled_end=TODAY + timedelta(days=1),
    )

    line = _check(db, product.id)

    # With the pool contended tomorrow, this batch can't be the first
    # thing scheduled there -- it's pushed at least one day later than
    # the bare "next working day" baseline.
    assert line.estimated_ready_date is not None
    assert line.estimated_ready_date > TODAY + timedelta(days=1)


def test_case_d_existing_bookings_affect_the_date(db):
    """D. A machine with existing bookings (regardless of material or
    worker constraints) still produces a later date than a fully free
    one -- same scan, same booked-hours netting, unmodified by this
    pass."""
    machine = make_machine(db, capacity_hours_per_day=8)
    product, _ = _product_with_formula(db, machine=machine, production_hours_per_unit=8)
    material = make_raw_material(db)
    make_bom(db, product.id, output_quantity=1)
    make_bom_line(db, product.id, "raw_material", material.id, quantity=1)
    set_stock(db, material.id, 100)

    baseline_line = _check(db, product.id)
    baseline_date = baseline_line.estimated_ready_date

    # A second, identical product/check on a machine that already has a
    # full day booked tomorrow should land later than the baseline.
    make_production_schedule(
        db,
        product_id=product.id,
        machine_id=machine.id,
        planned_quantity=1,  # 1 unit * 8h/unit = the whole day's 8h capacity
        scheduled_start=TODAY + timedelta(days=1),
        scheduled_end=TODAY + timedelta(days=1),
    )

    booked_line = _check(db, product.id)

    assert booked_line.estimated_ready_date is not None
    assert baseline_date is not None
    assert booked_line.estimated_ready_date > baseline_date
