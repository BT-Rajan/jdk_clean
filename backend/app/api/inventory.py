from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.permissions import require_page_access
from app.models.user import User
from app.schemas.inventory import (
    LowStockItem,
    StockAdjustRequest,
    StockLevelOut,
    StockMovementOut,
)
from app.services import inventory_service

router = APIRouter(prefix="/api/inventory", tags=["inventory"])
read_guard = require_page_access("inventory", "read")
write_guard = require_page_access("inventory", "write")


@router.get("/stock/{item_type}/{item_id}", response_model=StockLevelOut)
def get_stock(
    item_type: str,
    item_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(read_guard),
):
    return inventory_service.get_stock(db, item_type, item_id)


@router.post("/adjust", response_model=StockLevelOut)
def adjust_stock(
    payload: StockAdjustRequest,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    return inventory_service.adjust_stock(
        db,
        item_type=payload.item_type,
        item_id=payload.item_id,
        quantity=payload.quantity,
        movement_type=payload.movement_type,
        notes=payload.notes,
        user_id=user.id,
    )


@router.get("/low-stock", response_model=list[LowStockItem])
def low_stock(
    db: Session = Depends(get_db),
    _: User = Depends(read_guard),
):
    return inventory_service.get_low_stock(db)


@router.get("/movements")
def movements(
    item_type: str | None = Query(None),
    item_id: int | None = Query(None),
    reference_type: str | None = Query(None),
    reference_id: int | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=200),
    sort: str | None = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(read_guard),
):
    result = inventory_service.get_movement_history(
        db,
        item_type=item_type,
        item_id=item_id,
        reference_type=reference_type,
        reference_id=reference_id,
        page=page,
        page_size=page_size,
        sort=sort,
    )
    result["items"] = [StockMovementOut.model_validate(m) for m in result["items"]]
    return result
