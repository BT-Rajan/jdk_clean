"""'Where Used' for masters that have a real relational footprint
elsewhere in the app (see MDM spec section 11). Every group here is a
live query against the actual referencing tables -- never a
manually-synchronized list -- so it can't drift from what's actually
true. Capped at SAMPLE_LIMIT rows per group with a separate `total`
count, since a heavily-used raw material or product could otherwise
return thousands of rows to a UI that only needs "used in 40 orders,
here are a few".

Feasibility's per-line shortfall (a materials list) is stored as a JSON
blob (see models/feasibility.py FeasibilityLine.shortfall_json) rather
than a proper FK row per material, so raw-material usage doesn't
include it here -- querying JSON contents reliably across this app's
supported databases (MySQL in production, SQLite for local smoke tests)
isn't something to bolt on without being able to verify it against a
real database. Product usage does include Feasibility, since
FeasibilityLine.product_id is a real FK.
"""

from sqlalchemy.orm import Session

from app.models.bom import BomLine
from app.models.feasibility import FeasibilityCheck, FeasibilityLine
from app.models.order import Order, OrderDetail
from app.models.product import Product
from app.models.product_packaging import ProductPackagingLine
from app.models.purchase_order import PurchaseOrder, PurchaseOrderLine
from app.models.quotation import Quotation, QuotationDetail
from app.models.supplier import Supplier
from app.models.supplier_material import SupplierMaterial

SAMPLE_LIMIT = 10


def _group(label: str, total: int, items: list[dict]) -> dict:
    return {"label": label, "total": total, "items": items[:SAMPLE_LIMIT]}


def raw_material_usage(db: Session, raw_material_id: int) -> dict:
    bom_rows = (
        db.query(Product)
        .join(BomLine, BomLine.parent_product_id == Product.id)
        .filter(
            BomLine.component_type == "raw_material",
            BomLine.component_id == raw_material_id,
            BomLine.deleted_at.is_(None),
            Product.deleted_at.is_(None),
        )
        .distinct()
        .all()
    )
    packaging_rows = (
        db.query(Product)
        .join(ProductPackagingLine, ProductPackagingLine.product_id == Product.id)
        .filter(
            ProductPackagingLine.packaging_material_id == raw_material_id,
            ProductPackagingLine.deleted_at.is_(None),
            Product.deleted_at.is_(None),
        )
        .distinct()
        .all()
    )
    supplier_rows = (
        db.query(Supplier)
        .join(SupplierMaterial, SupplierMaterial.supplier_id == Supplier.id)
        .filter(
            SupplierMaterial.raw_material_id == raw_material_id,
            SupplierMaterial.deleted_at.is_(None),
            Supplier.deleted_at.is_(None),
        )
        .distinct()
        .all()
    )
    po_rows = (
        db.query(PurchaseOrder)
        .join(PurchaseOrderLine, PurchaseOrderLine.purchase_order_id == PurchaseOrder.id)
        .filter(PurchaseOrderLine.raw_material_id == raw_material_id, PurchaseOrder.deleted_at.is_(None))
        .distinct()
        .all()
    )

    return {
        "boms": _group(
            "Bills of Materials",
            len(bom_rows),
            [{"id": p.id, "label": f"{p.code} — {p.name}", "route": f"/products/{p.id}"} for p in bom_rows],
        ),
        "packaging": _group(
            "Packaging",
            len(packaging_rows),
            [{"id": p.id, "label": f"{p.code} — {p.name}", "route": f"/products/{p.id}"} for p in packaging_rows],
        ),
        "suppliers": _group(
            "Suppliers",
            len(supplier_rows),
            [{"id": s.id, "label": f"{s.code} — {s.name}", "route": f"/suppliers/{s.id}"} for s in supplier_rows],
        ),
        "purchase_orders": _group(
            "Purchase Orders",
            len(po_rows),
            [{"id": po.id, "label": po.po_number, "route": f"/purchase-orders/{po.id}"} for po in po_rows],
        ),
    }


def product_usage(db: Session, product_id: int) -> dict:
    sub_assembly_rows = (
        db.query(Product)
        .join(BomLine, BomLine.parent_product_id == Product.id)
        .filter(
            BomLine.component_type == "product",
            BomLine.component_id == product_id,
            BomLine.deleted_at.is_(None),
            Product.deleted_at.is_(None),
        )
        .distinct()
        .all()
    )
    quotation_rows = (
        db.query(Quotation)
        .join(QuotationDetail, QuotationDetail.quotation_id == Quotation.id)
        .filter(QuotationDetail.product_id == product_id, Quotation.deleted_at.is_(None))
        .distinct()
        .all()
    )
    order_rows = (
        db.query(Order)
        .join(OrderDetail, OrderDetail.order_id == Order.id)
        .filter(OrderDetail.product_id == product_id, Order.deleted_at.is_(None))
        .distinct()
        .all()
    )
    feasibility_rows = (
        db.query(FeasibilityCheck)
        .join(FeasibilityLine, FeasibilityLine.feasibility_id == FeasibilityCheck.id)
        .filter(FeasibilityLine.product_id == product_id, FeasibilityCheck.deleted_at.is_(None))
        .distinct()
        .all()
    )

    return {
        "boms": _group(
            "Used as a sub-assembly in",
            len(sub_assembly_rows),
            [{"id": p.id, "label": f"{p.code} — {p.name}", "route": f"/products/{p.id}"} for p in sub_assembly_rows],
        ),
        "quotations": _group(
            "Quotations",
            len(quotation_rows),
            [{"id": q.id, "label": q.quotation_number, "route": f"/quotations/{q.id}"} for q in quotation_rows],
        ),
        "orders": _group(
            "Sales Orders",
            len(order_rows),
            [{"id": o.id, "label": o.order_number, "route": f"/orders/{o.id}"} for o in order_rows],
        ),
        "feasibilities": _group(
            "Feasibility Checks",
            len(feasibility_rows),
            [{"id": f.id, "label": f.feasibility_number, "route": f"/feasibilities/{f.id}"} for f in feasibility_rows],
        ),
    }
