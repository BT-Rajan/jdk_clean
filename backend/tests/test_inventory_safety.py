"""Regression test for inventory_service.adjust_stock's negative-stock
guard -- Priority 5 from the test brief. Feasibility's own read-only
guarantee (no inventory/BOM side effects from running a check) is
covered in test_feasibility_service.py::test_feasibility_is_read_only,
alongside the other feasibility assertions it naturally belongs with.
"""

import pytest

from app.core.exceptions import AppError
from app.services import inventory_service

from .factories import make_raw_material, set_stock


def test_negative_stock_rejected_and_stock_unchanged(db):
    material = make_raw_material(db)
    set_stock(db, material.id, 10)

    before = inventory_service.get_stock(db, "raw_material", material.id)

    with pytest.raises(AppError):
        # Only 10 on hand -- issuing 15 would take it negative.
        inventory_service.adjust_stock(db, "raw_material", material.id, -15, "issue")

    after = inventory_service.get_stock(db, "raw_material", material.id)

    assert after == before
