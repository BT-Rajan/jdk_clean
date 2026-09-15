"""Regression tests for supplier_return_service's purchase_order_id
cross-check -- a return naming a PO must actually be a return against
that same supplier, not a mismatched or unrelated purchase order (added
alongside the PurchaseOrderDetailPage integration that lets a return be
created directly from a PO's own page).
"""

import pytest

from app.core.exceptions import ValidationAppError
from app.services import supplier_return_service

from .factories import make_purchase_order, make_raw_material, make_supplier


def test_return_linked_to_a_po_from_a_different_supplier_is_rejected(db):
    material = make_raw_material(db)
    supplier_a = make_supplier(db)
    supplier_b = make_supplier(db)
    po = make_purchase_order(db, supplier_a.id, lines=[{"raw_material_id": material.id, "quantity": 10, "unit_price": 5}])

    with pytest.raises(ValidationAppError):
        supplier_return_service.create_supplier_return(
            db,
            {
                "supplier_id": supplier_b.id,
                "purchase_order_id": po.id,
                "return_date": po.order_date,
                "reason": "Off-spec",
                "lines": [{"raw_material_id": material.id, "quantity": 2}],
            },
        )


def test_return_linked_to_its_own_po_succeeds(db):
    material = make_raw_material(db)
    supplier = make_supplier(db)
    po = make_purchase_order(db, supplier.id, lines=[{"raw_material_id": material.id, "quantity": 10, "unit_price": 5}])
    from .factories import set_stock

    set_stock(db, material.id, 10)

    created = supplier_return_service.create_supplier_return(
        db,
        {
            "supplier_id": supplier.id,
            "purchase_order_id": po.id,
            "return_date": po.order_date,
            "reason": "Off-spec",
            "lines": [{"raw_material_id": material.id, "quantity": 2}],
        },
    )

    assert created.purchase_order_id == po.id
