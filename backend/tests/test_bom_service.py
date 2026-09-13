"""Regression tests for bom_service.explode_requirements -- the
calculation every feasibility/MRP/production-reservation figure is
built on. Protects the existing formula exactly as implemented; none of
these assert a *new* behavior.
"""

from app.core.exceptions import ConflictError
from app.services import bom_service
import pytest

from .factories import make_bom, make_bom_line, make_product, make_raw_material


def test_simple_bom(db):
    """A. Product requires Material A = 2 units, output_quantity = 1 ->
    producing 1 unit requires A = 2."""
    material = make_raw_material(db)
    product = make_product(db)
    bom = make_bom(db, product.id, output_quantity=1)
    make_bom_line(db, product.id, "raw_material", material.id, quantity=2)

    requirements = bom_service.explode_requirements(db, product.id, 1)

    assert requirements == {material.id: 2}


def test_output_quantity_scaling(db):
    """B. BOM: A = 2 per output_quantity = 10 -> producing 50 requires
    A = 2 * (50 / 10) = 10."""
    material = make_raw_material(db)
    product = make_product(db)
    bom = make_bom(db, product.id, output_quantity=10)
    make_bom_line(db, product.id, "raw_material", material.id, quantity=2)

    requirements = bom_service.explode_requirements(db, product.id, 50)

    assert requirements[material.id] == 10


def test_scrap_percent_applied_exactly_as_implemented(db):
    """C. Verify the existing scrap formula (quantity * (1 + scrap% /
    100) * scale) -- not a new one. 10% scrap on a line quantity of 2,
    output_quantity 1, producing 1 unit -> 2 * 1.10 = 2.2."""
    material = make_raw_material(db)
    product = make_product(db)
    make_bom(db, product.id, output_quantity=1)
    make_bom_line(db, product.id, "raw_material", material.id, quantity=2, scrap_percent=10)

    requirements = bom_service.explode_requirements(db, product.id, 1)

    assert requirements[material.id] == 2.2


def test_multi_level_bom(db):
    """D. Parent product -> component product (sub-assembly) -> raw
    material. Verify the final exploded raw-material requirement
    accounts for both levels' scaling."""
    raw = make_raw_material(db)
    sub_assembly = make_product(db)
    parent = make_product(db)

    # Sub-assembly's own BOM: 3 raw units per 1 sub-assembly unit.
    make_bom(db, sub_assembly.id, output_quantity=1)
    make_bom_line(db, sub_assembly.id, "raw_material", raw.id, quantity=3)

    # Parent's BOM: 2 sub-assembly units per 1 parent unit.
    make_bom(db, parent.id, output_quantity=1)
    make_bom_line(db, parent.id, "product", sub_assembly.id, quantity=2)

    # Producing 5 parent units -> 10 sub-assembly-equivalent units -> 30 raw units.
    requirements = bom_service.explode_requirements(db, parent.id, 5)

    assert requirements == {raw.id: 30}


def test_inactive_bom_does_not_contribute(db):
    """E. A sub-assembly's *inactive* BOM must not contribute to the
    parent's exploded requirement -- same as the sub-assembly having no
    BOM at all."""
    raw = make_raw_material(db)
    sub_assembly = make_product(db)
    parent = make_product(db)

    make_bom(db, sub_assembly.id, output_quantity=1, status="inactive")
    make_bom_line(db, sub_assembly.id, "raw_material", raw.id, quantity=3)

    make_bom(db, parent.id, output_quantity=1)
    make_bom_line(db, parent.id, "product", sub_assembly.id, quantity=2)

    requirements = bom_service.explode_requirements(db, parent.id, 5)

    assert requirements == {}


def test_cycle_detection_still_effective(db):
    """F. bom_service's own cycle guard (_assert_no_cycle, exercised via
    add_bom_line) must still reject a product being added as a component
    of its own (transitive) BOM."""
    a = make_product(db)
    b = make_product(db)
    make_bom(db, a.id, output_quantity=1)
    # a's BOM already requires b.
    make_bom_line(db, a.id, "product", b.id, quantity=1)
    make_bom(db, b.id, output_quantity=1)

    # Attempting to add a as a component of b's BOM would close the
    # loop (b -> a -> b) -- add_bom_line must refuse via _assert_no_cycle.
    with pytest.raises(ConflictError):
        bom_service.add_bom_line(db, b.id, {"component_type": "product", "component_id": a.id, "quantity": 1, "unit": "unit"})
