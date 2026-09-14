"""Regression tests for feasibility_service.run_check's material-side
decision logic: plain stock shortfalls, approved-alternative coverage
(Pass 2), and supplier lead-time projection (Pass 3). Capacity/machine
interaction is covered separately in test_feasibility_capacity.py, and
the production-start gate in test_production_readiness.py -- these
tests deliberately use products with no machine formula so
capacity_ok/estimated_ready_date's "not evaluable" behavior doesn't
obscure what's being asserted about materials.
"""

from datetime import datetime, timedelta, timezone

from app.models.inventory import StockMovement
from app.schemas.feasibility import FeasibilityOut
from app.services import bom_service, feasibility_service, inventory_service, settings_service

from .factories import (
    make_alternative,
    make_bom,
    make_bom_line,
    make_customer,
    make_product,
    make_raw_material,
    make_supplier,
    make_supplier_material,
    set_stock,
)

TODAY = datetime.now(timezone.utc).date()  # same basis run_check itself uses


def _buffered(db, lead_days):
    """The date a supplier's lead time alone projects, run through the
    same +1-clear-working-day rule run_check applies -- computed via the
    real settings_service helper (not a hardcoded weekday offset) so
    this doesn't depend on which day of the week the suite happens to
    run on."""
    return settings_service.next_working_day(TODAY + timedelta(days=lead_days), settings_service.get_working_days(db))


def _check(db, product_id, quantity=1, required_by_date=None):
    """Creates a draft feasibility check for one customer/product/quantity
    and runs it -- returns the resulting line, parsed through the same
    FeasibilityOut.from_model the API itself uses (not the raw ORM
    object, which only carries the unparsed *_json columns), so these
    tests see exactly what the frontend would."""
    customer = make_customer(db)
    feasibility = feasibility_service.create_feasibility(
        db,
        {
            "customer_id": customer.id,
            "required_by_date": required_by_date,
            "lines": [{"product_id": product_id, "quantity": quantity}],
        },
    )
    checked = feasibility_service.run_check(db, feasibility.id)
    return FeasibilityOut.from_model(checked).lines[0]


def _product_with_material(db, required_qty, stock_qty):
    """A product whose BOM needs exactly `required_qty` of one raw
    material (producing 1 unit), that material currently at `stock_qty`
    on hand. No machine formula -- these tests are about materials."""
    material = make_raw_material(db)
    product = make_product(db)
    make_bom(db, product.id, output_quantity=1)
    make_bom_line(db, product.id, "raw_material", material.id, quantity=required_qty)
    set_stock(db, material.id, stock_qty)
    return product, material


def test_case1_everything_available(db):
    """1. Required fully covered by stock -> no material blocker."""
    product, material = _product_with_material(db, required_qty=50, stock_qty=100)

    line = _check(db, product.id)

    assert line.is_feasible is True
    assert line.shortfalls == []


def test_case2_genuine_shortage_no_alternative(db):
    """2. Required = 100, stock = 60, no alternative -> shortage = 40,
    existing exception/shortage behavior preserved."""
    product, material = _product_with_material(db, required_qty=100, stock_qty=60)

    line = _check(db, product.id)

    assert line.is_feasible is False
    assert len(line.shortfalls) == 1
    assert line.shortfalls[0].raw_material_id == material.id
    assert line.shortfalls[0].shortfall == 40


def test_case3_alternative_fully_covers_shortage(db):
    """3. Required = 100, own stock = 60 (shortfall 40), approved
    alternative stock = 40 -> remaining shortage = 0, no unresolved
    material shortage."""
    product, material = _product_with_material(db, required_qty=100, stock_qty=60)
    alternative = make_raw_material(db)
    set_stock(db, alternative.id, 40)
    make_alternative(db, material.id, alternative.id, status="approved")

    line = _check(db, product.id)

    assert line.is_feasible is True
    assert line.shortfalls == []
    assert len(line.alternative_coverage) == 1
    coverage = line.alternative_coverage[0]
    assert coverage.raw_material_id == material.id
    assert coverage.original_shortfall == 40
    assert coverage.covered_by_alternatives == 40
    assert coverage.remaining_shortfall == 0


def test_case4_alternative_partially_covers_shortage(db):
    """4. Required = 100, own stock = 60 (shortfall 40), approved
    alternative stock = 20 -> alternative coverage = 20, remaining
    shortage = 20, material remains unresolved."""
    product, material = _product_with_material(db, required_qty=100, stock_qty=60)
    alternative = make_raw_material(db)
    set_stock(db, alternative.id, 20)
    make_alternative(db, material.id, alternative.id, status="approved")

    line = _check(db, product.id)

    assert line.is_feasible is False
    assert len(line.shortfalls) == 1
    assert line.shortfalls[0].shortfall == 20  # remaining, not the original 40
    coverage = line.alternative_coverage[0]
    assert coverage.covered_by_alternatives == 20
    assert coverage.remaining_shortfall == 20


def test_case5_unapproved_alternative_ignored(db):
    """5. An alternative that isn't 'approved' must be ignored entirely,
    even with ample stock -- shortage remains exactly what it would be
    with no alternative at all."""
    product, material = _product_with_material(db, required_qty=100, stock_qty=60)
    alternative = make_raw_material(db)
    set_stock(db, alternative.id, 1000)
    make_alternative(db, material.id, alternative.id, status="blocked")

    line = _check(db, product.id)

    assert line.is_feasible is False
    assert line.shortfalls[0].shortfall == 40  # unaffected by the blocked alternative
    assert line.alternative_coverage == []


def test_case6_no_supplier_unprojectable(db):
    """6. Genuine shortage, no supplier at all for this material ->
    unprojectable, no fabricated availability date."""
    product, material = _product_with_material(db, required_qty=100, stock_qty=60)

    line = _check(db, product.id)

    shortfall = line.shortfalls[0]
    assert shortfall.procurement.date_known is False
    assert shortfall.procurement.expected_available_date is None


def test_case7_supplier_with_known_lead_time(db):
    """7. Shortage remains after alternatives; a supplier with a known
    lead time covers it -> procurement quantity equals the remaining
    shortage (not the material's own full shortfall), and the projected
    date is today + that lead time + 1 clear working day (goods aren't
    usable stock the same day they land -- see next_working_day)."""
    product, material = _product_with_material(db, required_qty=100, stock_qty=60)
    supplier = make_supplier(db)
    make_supplier_material(db, supplier.id, material.id, lead_time_days=5, max_supply_quantity=1000)

    line = _check(db, product.id)

    shortfall = line.shortfalls[0]
    assert shortfall.shortfall == 40
    assert shortfall.procurement.date_known is True
    assert shortfall.procurement.suppliers[0].quantity == 40
    assert shortfall.procurement.suppliers[0].lead_time_days == 5
    assert shortfall.procurement.expected_available_date == _buffered(db, 5)


def test_case8_supplier_without_lead_time(db):
    """8. A supplier exists and covers the shortage but has no recorded
    lead time -> date stays unknown, system does not assume zero days,
    shortage is explicitly unprojectable."""
    product, material = _product_with_material(db, required_qty=100, stock_qty=60)
    supplier = make_supplier(db)
    make_supplier_material(db, supplier.id, material.id, lead_time_days=None, max_supply_quantity=1000)

    line = _check(db, product.id)

    shortfall = line.shortfalls[0]
    assert shortfall.procurement.date_known is False
    assert shortfall.procurement.expected_available_date is None


def test_case9_multiple_shortages_use_the_slowest(db):
    """9. Material A available in 3 days, B in 7, C available now (in
    one product's BOM) -> the line's material constraint is B's date, not
    A's and not the sum. Each date carries its own +1 clear working day
    buffer (see test_case7)."""
    material_a = make_raw_material(db)
    material_b = make_raw_material(db)
    material_c = make_raw_material(db)
    product = make_product(db)
    make_bom(db, product.id, output_quantity=1)
    make_bom_line(db, product.id, "raw_material", material_a.id, quantity=100)
    make_bom_line(db, product.id, "raw_material", material_b.id, quantity=100)
    make_bom_line(db, product.id, "raw_material", material_c.id, quantity=50)
    set_stock(db, material_a.id, 70)  # shortfall 30
    set_stock(db, material_b.id, 30)  # shortfall 70
    set_stock(db, material_c.id, 50)  # no shortfall at all

    supplier = make_supplier(db)
    make_supplier_material(db, supplier.id, material_a.id, lead_time_days=3, max_supply_quantity=1000)
    make_supplier_material(db, supplier.id, material_b.id, lead_time_days=7, max_supply_quantity=1000)

    line = _check(db, product.id)

    by_material = {s.raw_material_id: s for s in line.shortfalls}
    assert material_c.id not in by_material  # fully in stock, never a shortfall
    assert by_material[material_a.id].procurement.expected_available_date == _buffered(db, 3)
    assert by_material[material_b.id].procurement.expected_available_date == _buffered(db, 7)


def test_feasibility_is_read_only(db):
    """Running feasibility -- even with a shortfall, an approved
    alternative, and a supplier all in play at once -- must not change
    inventory, create inventory movements, or touch the BOM."""
    product, material = _product_with_material(db, required_qty=100, stock_qty=60)
    alternative = make_raw_material(db)
    set_stock(db, alternative.id, 20)
    make_alternative(db, material.id, alternative.id, status="approved")
    supplier = make_supplier(db)
    make_supplier_material(db, supplier.id, material.id, lead_time_days=5, max_supply_quantity=1000)

    before_material_stock = inventory_service.get_stock(db, "raw_material", material.id)
    before_alt_stock = inventory_service.get_stock(db, "raw_material", alternative.id)
    before_movement_count = db.query(StockMovement).count()
    before_bom_lines = bom_service.get_bom(db, product.id)
    before_bom_line_quantities = sorted(float(l.quantity) for l in before_bom_lines)

    _check(db, product.id)

    after_material_stock = inventory_service.get_stock(db, "raw_material", material.id)
    after_alt_stock = inventory_service.get_stock(db, "raw_material", alternative.id)
    after_movement_count = db.query(StockMovement).count()
    after_bom_lines = bom_service.get_bom(db, product.id)
    after_bom_line_quantities = sorted(float(l.quantity) for l in after_bom_lines)

    assert after_material_stock == before_material_stock
    assert after_alt_stock == before_alt_stock
    assert after_movement_count == before_movement_count
    assert after_bom_line_quantities == before_bom_line_quantities
    assert len(after_bom_lines) == len(before_bom_lines)
