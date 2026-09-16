"""P3 calculates and persists a Production Order's material requirement
-- reusing bom_service's existing BOM explosion, packaging_service's
existing packaging lines, and inventory_service's existing stock
ledger. P4 (allocate/release) commits available stock against those
requirements, reusing inventory_service's own reservation primitive
(quantity_reserved) rather than a second reservation system -- see
reserve_stock_within_available's docstring for why a *capped* variant
was needed alongside the existing (deliberately uncapped) reserve_stock.

No parallel BOM/MRP/stock engine lives here; this module only
orchestrates those three plus the ProductionOrder itself. Still stops
short of material issue/consumption -- allocation commits stock, it
never physically removes it. See docs/production-lifecycle.md for the
full P3/P4/P5 boundary.
"""

from sqlalchemy.orm import Session, joinedload

from app.core.exceptions import ConflictError, NotFoundError, ValidationAppError
from app.models.product import Product
from app.models.production_order import ProductionOrder
from app.models.production_order_material import ProductionOrderMaterialRequirement
from app.models.raw_material import RawMaterial
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
    availability and this app's own allocation decisions -- required/
    available/allocated/remaining/shortage per material. available is
    computed fresh every call (same stance mrp_service.compute_
    requirements already takes), never itself persisted; allocated is
    read straight off the row (see allocate/release below for the only
    place it's written).

    shortage nets out what's already allocated to THIS row, not just
    what's sitting available in the warehouse: `required - allocated -
    available`, clamped at 0 -- "even taking everything currently
    available plus what we've already committed, would we still be
    short, and by how much." Before any allocation exists (allocated=0)
    this is exactly P3's original required-vs-available shortage.
    """
    requirements = get_requirements(db, production_order_id)

    items = []
    for req in requirements:
        material = req.raw_material
        stock = inventory_service.get_stock(db, "raw_material", req.raw_material_id)
        required = float(req.required_quantity)
        allocated = float(req.allocated_quantity)
        available = stock["quantity_available"]
        remaining_to_allocate = max(round(required - allocated, 4), 0)
        shortage = max(round(required - allocated - available, 4), 0)
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
                "allocated_quantity": allocated,
                "remaining_to_allocate": remaining_to_allocate,
                "shortage_quantity": shortage,
            }
        )

    if not items:
        overall_status = "not_calculated"
    elif any(item["shortage_quantity"] > 0 for item in items):
        overall_status = "short"
    else:
        overall_status = "available"

    if not items:
        allocation_status = "not_calculated"
    elif all(item["remaining_to_allocate"] <= 0 for item in items):
        allocation_status = "fully_allocated"
    elif all(item["allocated_quantity"] <= 0 for item in items):
        allocation_status = "not_allocated"
    else:
        allocation_status = "partially_allocated"

    return {
        "production_order_id": production_order_id,
        "overall_status": overall_status,
        "allocation_status": allocation_status,
        "calculated_at": requirements[0].created_at if requirements else None,
        "items": items,
    }


def _lock_requirement_row(db: Session, production_order_id: int, requirement_id: int):
    """Column-only locking read -- see calculate()'s own comment on why:
    ProductionOrderMaterialRequirement's relationships are lazy="joined"
    at the model level, so a plain entity query under with_for_update()
    would implicitly outer-join them; and reading these exact columns
    through the lock (not a plain read before/after it) is what makes
    the value seen here immune to this app's REPEATABLE READ snapshot
    staleness (see reserve_stock_within_available's docstring for the
    same reasoning applied to the inventory row)."""
    row = (
        db.query(
            ProductionOrderMaterialRequirement.id,
            ProductionOrderMaterialRequirement.raw_material_id,
            ProductionOrderMaterialRequirement.required_quantity,
            ProductionOrderMaterialRequirement.allocated_quantity,
        )
        .filter(
            ProductionOrderMaterialRequirement.id == requirement_id,
            ProductionOrderMaterialRequirement.production_order_id == production_order_id,
        )
        .with_for_update()
        .first()
    )
    if row is None:
        raise NotFoundError("Material requirement")
    return row


def _lock_production_order_status(db: Session, production_order_id: int) -> str:
    locked = (
        db.query(ProductionOrder.status).filter(ProductionOrder.id == production_order_id).with_for_update().first()
    )
    if locked is None:
        raise NotFoundError("Production order")
    return locked.status


def allocate(
    db: Session, production_order_id: int, requirement_id: int, quantity: float, user_id: int | None = None
) -> dict:
    """Commits up to `quantity` of currently available raw-material stock
    to this requirement row -- never more than what's still required,
    never more than what's actually available, and never against a
    cancelled Production Order. Reuses inventory_service's own
    reservation ledger (reserve_stock_within_available bumps
    quantity_reserved on the same RawMaterialInventory row every other
    reservation in this app already uses) rather than a parallel one;
    `allocated_quantity` on this row is this app's own record of how
    much of that shared reservation belongs to this Production Order.

    Physical on-hand stock is never touched -- only quantity_reserved
    (a claim) and this row's own allocated_quantity move.
    """
    if quantity <= 0:
        raise ValidationAppError("Allocation quantity must be positive.")

    status = _lock_production_order_status(db, production_order_id)
    if status != "planned":
        raise ConflictError(
            f"Cannot allocate material for a production order in '{status}' status; it must be planned."
        )

    requirement = _lock_requirement_row(db, production_order_id, requirement_id)
    required = float(requirement.required_quantity)
    allocated = float(requirement.allocated_quantity)
    remaining = round(required - allocated, 4)
    if quantity > remaining:
        raise ValidationAppError(
            f"Cannot allocate {quantity} -- only {remaining} is still required for this material."
        )

    material = (
        db.query(RawMaterial)
        .filter(RawMaterial.id == requirement.raw_material_id, RawMaterial.deleted_at.is_(None))
        .first()
    )
    if material is None:
        raise ValidationAppError("This requirement's material no longer exists.")
    if material.status != "active":
        raise ValidationAppError(f"{material.name} is inactive and cannot be allocated.")

    # Raises ValidationAppError itself if `quantity` exceeds what's
    # currently available -- see its own docstring for the locking that
    # makes this safe against a second Production Order allocating the
    # same stock concurrently (Production A takes 700 of 1,000; B's own
    # attempt at 500 sees only 300 left, by the time its lock is granted,
    # regardless of when either request's transaction actually started).
    inventory_service.reserve_stock_within_available(
        db, "raw_material", requirement.raw_material_id, quantity, commit=False
    )

    new_allocated = round(allocated + quantity, 4)
    db.query(ProductionOrderMaterialRequirement).filter(
        ProductionOrderMaterialRequirement.id == requirement.id
    ).update({"allocated_quantity": new_allocated, "updated_by": user_id})
    audit_service.log_update(
        db, TABLE_NAME, requirement.id, {"allocated_quantity": (allocated, new_allocated)}, user_id
    )
    db.commit()
    return get_requirement_summary(db, production_order_id)


def release(
    db: Session, production_order_id: int, requirement_id: int, quantity: float, user_id: int | None = None
) -> dict:
    """Reverses part or all of a prior allocation -- reduces this row's
    allocated_quantity and returns the same amount to allocatable stock
    (release_reservation, the same primitive order cancellation already
    uses). Physical on-hand stock is never touched, the customer order
    is never touched, the BOM is never touched, and nothing here creates
    a purchase transaction.

    Not gated on the Production Order's own status (unlike allocate) --
    cancelling a Production Order deliberately leaves its allocations
    alone (see production_order_service.change_status), so release is
    the only way to free stock committed to an order that's since been
    cancelled; there is no reason to block that.

    There is no `consumed_quantity` yet (P4 doesn't implement material
    issue) -- once a later pass adds one, this is where a `quantity <=
    allocated_quantity - consumed_quantity` guard belongs.
    """
    if quantity <= 0:
        raise ValidationAppError("Release quantity must be positive.")

    requirement = _lock_requirement_row(db, production_order_id, requirement_id)
    allocated = float(requirement.allocated_quantity)
    if quantity > allocated:
        raise ValidationAppError(f"Cannot release {quantity} -- only {allocated} is currently allocated.")

    inventory_service.release_reservation(db, "raw_material", requirement.raw_material_id, quantity, commit=False)

    new_allocated = round(allocated - quantity, 4)
    db.query(ProductionOrderMaterialRequirement).filter(
        ProductionOrderMaterialRequirement.id == requirement.id
    ).update({"allocated_quantity": new_allocated, "updated_by": user_id})
    audit_service.log_update(
        db, TABLE_NAME, requirement.id, {"allocated_quantity": (allocated, new_allocated)}, user_id
    )
    db.commit()
    return get_requirement_summary(db, production_order_id)
