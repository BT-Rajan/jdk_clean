from sqlalchemy.orm import Session, joinedload

from app.models.order import Order
from app.models.production_schedule import ProductionSchedule
from app.models.raw_material import RawMaterial
from app.models.supplier import Supplier
from app.models.supplier_material import SupplierMaterial
from app.services import bom_service, inventory_service

# Orders in these statuses still need their goods produced/shipped, so
# they're live demand. draft isn't included (not yet committed),
# shipped/delivered/cancelled aren't (already fulfilled or moot).
OUTSTANDING_ORDER_STATUSES = ("confirmed", "in_production", "ready_to_ship")

# Batches in these statuses represent already-decided future production
# runs -- the most concrete demand signal there is, since someone
# explicitly scheduled them (see production_service.py).
SCHEDULED_BATCH_STATUSES = ("planned", "in_progress")


def _quantity_to_produce(db: Session) -> dict[int, float]:
    """How much of each product still needs producing, from two demand
    streams that are deliberately kept from double-counting each other:

    1. Every scheduled (not yet completed) production batch's
       planned_quantity -- these are already decided, regardless of
       whether they're for stock or tied to an order.
    2. Outstanding order lines whose order has NO batch scheduled against
       it yet at all, net of that product's current finished-goods stock.
       This is what surfaces "this order needs a batch scheduled" rather
       than double-planning demand that's already covered by (1).

    An order with a batch scheduled is assumed covered by that batch for
    this purpose, even if the batch's quantity doesn't exactly match the
    order line -- getting that reconciliation exactly right needs
    partial-fulfillment tracking this schema doesn't have yet. Good
    enough for a first MRP pass; refine later if batches routinely
    under-schedule against their order.
    """
    product_qty: dict[int, float] = {}

    batches = (
        db.query(ProductionSchedule)
        .filter(
            ProductionSchedule.status.in_(SCHEDULED_BATCH_STATUSES),
            ProductionSchedule.deleted_at.is_(None),
        )
        .all()
    )
    batched_order_ids = {b.order_id for b in batches if b.order_id}
    for batch in batches:
        product_qty[batch.product_id] = product_qty.get(batch.product_id, 0.0) + float(
            batch.planned_quantity
        )

    orders_query = db.query(Order).options(joinedload(Order.lines)).filter(
        Order.status.in_(OUTSTANDING_ORDER_STATUSES),
        Order.deleted_at.is_(None),
    )
    if batched_order_ids:
        orders_query = orders_query.filter(~Order.id.in_(batched_order_ids))

    for order in orders_query.all():
        for line in order.lines:
            stock = inventory_service.get_stock(db, "product", line.product_id)
            still_needed = max(0.0, float(line.quantity) - stock["quantity_on_hand"])
            if still_needed > 0:
                product_qty[line.product_id] = product_qty.get(line.product_id, 0.0) + still_needed

    return product_qty


def _raw_material_requirements(db: Session, product_qty: dict[int, float]) -> dict[int, float]:
    """Explodes every product's to-produce quantity through its BOM
    (bom_service.explode_requirements, which already returns each raw
    material's quantity converted into that material's own unit) and
    sums the results across products into total raw-material demand.
    Safe to sum directly since every product's contribution is already
    in the same unit per material by the time it comes back here."""
    totals: dict[int, float] = {}
    for product_id, qty in product_qty.items():
        if qty <= 0:
            continue
        for raw_material_id, required_qty in bom_service.explode_requirements(db, product_id, qty).items():
            totals[raw_material_id] = totals.get(raw_material_id, 0.0) + required_qty
    return totals


def _suggest_purchases(db: Session, raw_material_id: int, shortfall: float) -> tuple[list[dict], float]:
    """Greedily allocates the shortfall across known suppliers of this
    material, fastest lead time first, respecting each supplier's
    max_supply_quantity. Returns (suggestions, uncovered_quantity)."""
    supplier_lines = (
        db.query(SupplierMaterial)
        .join(Supplier, SupplierMaterial.supplier_id == Supplier.id)
        .filter(
            SupplierMaterial.raw_material_id == raw_material_id,
            SupplierMaterial.deleted_at.is_(None),
            Supplier.deleted_at.is_(None),
            Supplier.status == "active",
        )
        # MariaDB has never implemented ANSI NULLS LAST syntax (unlike
        # PostgreSQL, or MySQL 8.0.13+) -- SQLAlchemy's .nulls_last()
        # compiles straight through to that keyword rather than
        # emulating it, which fails outright on MariaDB. This achieves
        # the same ordering portably: NULL sorts as boolean True (1),
        # so "is this NULL" ascending puts every non-NULL row first,
        # then lead_time_days breaks ties among those.
        .order_by(SupplierMaterial.lead_time_days.is_(None), SupplierMaterial.lead_time_days.asc())
        .all()
    )

    remaining = shortfall
    suggestions: list[dict] = []
    for line in supplier_lines:
        if remaining <= 0:
            break
        take = min(remaining, float(line.max_supply_quantity))
        suggestions.append(
            {
                "supplier_id": line.supplier_id,
                "supplier_code": line.supplier.code,
                "supplier_name": line.supplier.name,
                "quantity": take,
                "lead_time_days": line.lead_time_days,
                "mode_of_supply": line.supplier.mode_of_supply,
            }
        )
        remaining -= take
    return suggestions, max(0.0, remaining)


def compute_requirements(db: Session) -> list[dict]:
    """The full MRP pass: demand -> BOM explosion -> net against stock ->
    supplier suggestions for every raw material with a shortfall. Read-only
    -- nothing here persists anything, it's computed fresh every call."""
    product_qty = _quantity_to_produce(db)
    raw_totals = _raw_material_requirements(db, product_qty)

    if not raw_totals:
        return []

    materials = {
        m.id: m
        for m in db.query(RawMaterial).filter(RawMaterial.id.in_(raw_totals.keys())).all()
    }

    results: list[dict] = []
    for raw_material_id, total_required in raw_totals.items():
        stock = inventory_service.get_stock(db, "raw_material", raw_material_id)
        on_hand = stock["quantity_on_hand"]
        shortfall = max(0.0, total_required - on_hand)
        if shortfall <= 0:
            continue

        material = materials.get(raw_material_id)
        suggestions, uncovered = _suggest_purchases(db, raw_material_id, shortfall)

        results.append(
            {
                "raw_material_id": raw_material_id,
                "code": material.code if material else f"#{raw_material_id}",
                "name": material.name if material else "Unknown material",
                "unit": material.unit if material else "",
                "reorder_point": float(material.reorder_point) if material else 0.0,
                "total_required": total_required,
                "current_on_hand": on_hand,
                "shortfall": shortfall,
                "uncovered_quantity": uncovered,
                "fully_covered": uncovered <= 0,
                "suggested_purchases": suggestions,
            }
        )

    results.sort(key=lambda r: r["shortfall"], reverse=True)
    return results
