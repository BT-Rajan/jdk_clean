from sqlalchemy.orm import Session

from app.core.exceptions import AppError, NotFoundError, ValidationAppError
from app.models.inventory import FinishedGoodsInventory, RawMaterialInventory, StockMovement
from app.models.product import Product
from app.models.raw_material import RawMaterial

_INVENTORY_MODEL = {
    "product": (FinishedGoodsInventory, "product_id", Product),
    "raw_material": (RawMaterialInventory, "raw_material_id", RawMaterial),
}


def _get_or_create_inventory_row(db: Session, item_type: str, item_id: int, for_update: bool = False):
    inv_model, fk_field, item_model = _INVENTORY_MODEL[item_type]

    item = db.query(item_model).filter(item_model.id == item_id, item_model.deleted_at.is_(None)).first()
    if item is None:
        raise NotFoundError(item_model.__name__)

    query = db.query(inv_model).filter(getattr(inv_model, fk_field) == item_id)
    if for_update:
        query = query.with_for_update()
    row = query.first()

    if row is None:
        row = inv_model(**{fk_field: item_id}, quantity_on_hand=0, quantity_reserved=0)
        db.add(row)
        db.flush()
    return row


def get_stock(db: Session, item_type: str, item_id: int) -> dict:
    row = _get_or_create_inventory_row(db, item_type, item_id)
    db.commit()
    return {
        "item_type": item_type,
        "item_id": item_id,
        "quantity_on_hand": float(row.quantity_on_hand),
        "quantity_reserved": float(row.quantity_reserved),
        "quantity_available": float(row.quantity_on_hand) - float(row.quantity_reserved),
    }


def check_availability(db: Session, item_type: str, item_id: int, quantity_needed: float) -> bool:
    row = _get_or_create_inventory_row(db, item_type, item_id)
    db.commit()
    available = float(row.quantity_on_hand) - float(row.quantity_reserved)
    return available >= quantity_needed


def adjust_stock(
    db: Session,
    item_type: str,
    item_id: int,
    quantity: float,
    movement_type: str,
    reference_type: str | None = None,
    reference_id: int | None = None,
    notes: str | None = None,
    user_id: int | None = None,
) -> dict:
    """Apply a signed quantity delta to on-hand stock and record the movement.

    quantity > 0 means stock coming in, quantity < 0 means stock going out.
    Refuses to let on-hand stock go negative.
    """
    if item_type not in _INVENTORY_MODEL:
        raise ValidationAppError("item_type must be 'product' or 'raw_material'.")
    if quantity == 0:
        raise ValidationAppError("Quantity must not be zero.")

    row = _get_or_create_inventory_row(db, item_type, item_id, for_update=True)

    new_quantity = float(row.quantity_on_hand) + quantity
    if new_quantity < 0:
        raise AppError(
            f"Insufficient stock: {row.quantity_on_hand} on hand, cannot apply change of {quantity}."
        )

    row.quantity_on_hand = new_quantity
    db.add(
        StockMovement(
            item_type=item_type,
            item_id=item_id,
            movement_type=movement_type,
            quantity=quantity,
            reference_type=reference_type,
            reference_id=reference_id,
            notes=notes,
            created_by=user_id,
        )
    )
    db.commit()
    return get_stock(db, item_type, item_id)


def get_low_stock(db: Session) -> list[dict]:
    """Raw materials whose on-hand quantity is at or below their reorder point."""
    rows = (
        db.query(RawMaterial, RawMaterialInventory)
        .join(
            RawMaterialInventory,
            RawMaterialInventory.raw_material_id == RawMaterial.id,
            isouter=True,
        )
        .filter(RawMaterial.deleted_at.is_(None), RawMaterial.status == "active")
        .all()
    )
    low = []
    for material, inv in rows:
        on_hand = float(inv.quantity_on_hand) if inv else 0.0
        if on_hand <= float(material.reorder_point):
            low.append(
                {
                    "raw_material_id": material.id,
                    "code": material.code,
                    "name": material.name,
                    "quantity_on_hand": on_hand,
                    "reorder_point": float(material.reorder_point),
                }
            )
    return low


def get_movement_history(
    db: Session,
    item_type: str | None = None,
    item_id: int | None = None,
    reference_type: str | None = None,
    reference_id: int | None = None,
    page: int = 1,
    page_size: int = 25,
) -> dict:
    query = db.query(StockMovement)
    if item_type:
        query = query.filter(StockMovement.item_type == item_type)
    if item_id:
        query = query.filter(StockMovement.item_id == item_id)
    if reference_type:
        query = query.filter(StockMovement.reference_type == reference_type)
    if reference_id:
        query = query.filter(StockMovement.reference_id == reference_id)

    total = query.count()
    page = max(page, 1)
    page_size = min(max(page_size, 1), 200)
    items = (
        query.order_by(StockMovement.created_at.desc(), StockMovement.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size if page_size else 0,
    }
