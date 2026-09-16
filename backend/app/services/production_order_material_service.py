"""P3: calculates and persists a Production Order's material
requirement -- reusing bom_service's existing BOM explosion,
packaging_service's existing packaging lines, and inventory_service's
existing stock ledger. No parallel BOM/MRP/stock engine lives here; this
module only orchestrates those three plus the ProductionOrder itself.

Deliberately stops at "required vs. available vs. shortage" -- no
reservation, no stock movement, no purchase order. See
docs/production-lifecycle.md for the full P3/P4 boundary.
"""

from sqlalchemy.orm import Session, joinedload

from app.core.exceptions import ConflictError, NotFoundError, ValidationAppError
from app.models.product import Product
from app.models.production_order import ProductionOrder
from app.models.production_order_material import ProductionOrderMaterialRequirement
from app.services import audit_service, bom_service, inventory_service, packaging_service

TABLE_NAME = "production_order_material_requirements"

# Mirrors RawMaterial.MATERIAL_TYPES -- the existing classification this
# module reuses for the requirement view's "Type" column rather than
# inventing a second taxonomy (see raw_material.py).
_MATERIAL_TYPE_LABELS = {
    "raw_material": "Raw Material",
    "packaging": "Packaging Material",
    "consumable": "Other production component",
}


def _base_query(db: Session):
    return db.query(ProductionOrderMaterialRequirement).options(
        joinedload(ProductionOrderMaterialRequirement.raw_material),
        joinedload(ProductionOrderMaterialRequirement.bom),
    )


def get_requirements(db: Session, production_order_id: int) -> list[ProductionOrderMaterialRequirement]:
    return (
        _base_query(db)
        .filter(ProductionOrderMaterialRequirement.production_order_id == production_order_id)
        .order_by(ProductionOrderMaterialRequirement.id)
        .all()
    )


def calculate(db: Session, production_order_id: int, user_id: int | None = None) -> list[ProductionOrderMaterialRequirement]:
    """(Re)calculates this Production Order's material requirement from
    its product's current active BOM and packaging definition, replacing
    whatever was calculated before -- idempotent (delete-then-insert
    inside one transaction, guarded by the row lock below plus the
    table's own unique constraint) rather than accumulating duplicate
    rows on every call. Only allowed while the Production Order is still
    'planned' -- once it's moved past that (a later pass's concern; only
    'cancelled' exists as an alternative today), a requirement snapshot
    already committed to downstream planning shouldn't be casually
    overwritten by a fresh calculation.
    """
    # Locked for the whole call so two concurrent recalculation requests
    # for the same Production Order can't interleave their delete+insert.
    # Selects bare columns rather than the mapped entity: ProductionOrder's
    # own relationships (product/order/order_detail) are declared
    # lazy="joined" at the model level, so a plain entity query would
    # implicitly outer-join them even here -- same reason order_service.
    # get_order's for_update branch avoids _base_query's joinedloads.
    # Reading `status` through this same locking query (not a plain read
    # afterward) matters for the same reason it did in
    # production_order_service._committed_quantity: under this app's
    # REPEATABLE READ default, a plain read can still return data from
    # before this transaction's snapshot was fixed (typically by the
    # auth dependency's own earlier read) even after waiting on and
    # acquiring this row's lock -- a locking read has no such blind spot.
    locked = (
        db.query(ProductionOrder.status, ProductionOrder.product_id, ProductionOrder.planned_quantity)
        .filter(ProductionOrder.id == production_order_id)
        .with_for_update()
        .first()
    )
    if locked is None:
        raise NotFoundError("Production order")
    status, product_id, planned_quantity = locked.status, locked.product_id, float(locked.planned_quantity)
    if status != "planned":
        raise ConflictError(
            f"Cannot calculate material requirements for a production order in '{status}' status; "
            f"it must be planned."
        )

    product = db.query(Product).filter(Product.id == product_id, Product.deleted_at.is_(None)).first()
    if product is None:
        raise ValidationAppError("This production order's product no longer exists.")
    if not bom_service.has_bom(db, product.id):
        raise ValidationAppError(f"{product.name} has no active BOM -- material requirements cannot be calculated.")
    bom = bom_service.get_bom_header(db, product.id)

    detailed = bom_service.explode_requirements_detailed(db, product.id, planned_quantity)
    if not detailed:
        raise ValidationAppError(
            f"{product.name}'s BOM produced no raw material requirements for this quantity -- "
            f"check that its active BOM has components configured."
        )

    rows: list[dict] = []
    for raw_material_id, req in detailed.items():
        quantity = round(req["scrap_inflated_required"], 4)
        if quantity > 0:
            rows.append(
                {"raw_material_id": raw_material_id, "bom_id": bom.id, "source": "bom", "required_quantity": quantity}
            )

    for line in packaging_service.get_packaging(db, product.id):
        # Per finished-product unit, not per-batch/scrap-inflated like a
        # BOM line -- packaging isn't part of the manufacturing formula
        # (see product_packaging.py's own docstring).
        quantity = round(float(line.quantity_per_unit) * planned_quantity, 4)
        if quantity > 0:
            rows.append(
                {
                    "raw_material_id": line.packaging_material_id,
                    "bom_id": None,
                    "source": "packaging",
                    "required_quantity": quantity,
                }
            )

    db.query(ProductionOrderMaterialRequirement).filter(
        ProductionOrderMaterialRequirement.production_order_id == production_order_id
    ).delete(synchronize_session=False)

    for row in rows:
        db.add(ProductionOrderMaterialRequirement(production_order_id=production_order_id, created_by=user_id, **row))
    db.flush()

    audit_service.log_update(
        db, TABLE_NAME, production_order_id, {"requirement_line_count": (None, len(rows))}, user_id
    )
    db.commit()
    return get_requirements(db, production_order_id)


def get_requirement_summary(db: Session, production_order_id: int) -> dict:
    """Combines the persisted requirement rows with live inventory
    availability -- required/available/shortage per material, computed
    fresh every call (same stance mrp_service.compute_requirements
    already takes), never itself persisted."""
    requirements = get_requirements(db, production_order_id)

    items = []
    for req in requirements:
        material = req.raw_material
        stock = inventory_service.get_stock(db, "raw_material", req.raw_material_id)
        required = float(req.required_quantity)
        available = stock["quantity_available"]
        shortage = max(round(required - available, 4), 0)
        items.append(
            {
                "id": req.id,
                "raw_material_id": req.raw_material_id,
                "code": material.code,
                "name": material.name,
                "unit": material.unit,
                "material_type": material.material_type,
                "material_type_label": _MATERIAL_TYPE_LABELS.get(material.material_type, material.material_type),
                "source": req.source,
                "bom_id": req.bom_id,
                "bom_number": req.bom.bom_number if req.bom else None,
                "required_quantity": required,
                "available_quantity": available,
                "shortage_quantity": shortage,
            }
        )

    if not items:
        overall_status = "not_calculated"
    elif any(item["shortage_quantity"] > 0 for item in items):
        overall_status = "short"
    else:
        overall_status = "available"

    return {
        "production_order_id": production_order_id,
        "overall_status": overall_status,
        "calculated_at": requirements[0].created_at if requirements else None,
        "items": items,
    }
