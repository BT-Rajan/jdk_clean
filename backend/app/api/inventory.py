from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.common import PagedResponse
from app.api.deps import require_role
from app.core.database import get_db
from app.core.permissions import require_page_access
from app.models.user import User
from app.schemas.inventory import (
    FinishedGoodStockItem,
    LowStockItem,
    RawMaterialStockItem,
    StockAdjustmentRejectRequest,
    StockAdjustmentRequestOut,
    StockAdjustmentResultOut,
    StockAdjustRequest,
    StockLevelOut,
    StockMovementOut,
)
from app.services import inventory_service, mrp_service, purchase_order_service

router = APIRouter(prefix="/api/inventory", tags=["inventory"])
read_guard = require_page_access("inventory", "read")
write_guard = require_page_access("inventory", "write")
admin_guard = require_role("admin")


@router.get("/finished-goods", response_model=PagedResponse)
def finished_goods_stock(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=200),
    search: str | None = Query(None),
    sort: str | None = Query(None),
    low_only: bool = Query(False),
    db: Session = Depends(get_db),
    _: User = Depends(read_guard),
):
    """Stock overview across every active finished good/sub-assembly --
    on hand, reserved, available, and whether it's at/below its reorder
    point. Complements /stock/{item_type}/{item_id}, which only answers
    for one product at a time."""
    result = inventory_service.get_finished_goods_stock(
        db, page=page, page_size=page_size, search=search, sort=sort, low_only=low_only
    )
    result["items"] = [FinishedGoodStockItem.model_validate(i) for i in result["items"]]
    return result


@router.get("/raw-materials", response_model=PagedResponse)
def raw_material_stock(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=200),
    search: str | None = Query(None),
    sort: str | None = Query(None),
    low_only: bool = Query(False),
    material_type: str | None = Query(None, pattern="^(raw_material|packaging|consumable)$"),
    db: Session = Depends(get_db),
    _: User = Depends(read_guard),
):
    """Raw material equivalent of /finished-goods -- on hand, reserved,
    available for every active raw material. `material_type` shows
    packaging (or consumable) stock independently from ordinary raw
    material stock instead of always mixed into one list. Each row also
    carries the open-PO incoming quantity and (when there is live demand
    and a shortfall) the MRP required quantity / shortfall."""
    result = inventory_service.get_raw_material_stock(
        db, page=page, page_size=page_size, search=search, sort=sort, low_only=low_only, material_type=material_type
    )
    page_ids = [i["raw_material_id"] for i in result["items"]]
    incoming = purchase_order_service.get_open_quantities_by_material(db, page_ids) if page_ids else {}
    # MRP only reports materials with live demand *and* a shortfall --
    # reused as-is (no re-derivation of demand/shortfall here), just
    # looked up per material on this page.
    requirements = {r["raw_material_id"]: r for r in mrp_service.compute_requirements(db)} if page_ids else {}
    for item in result["items"]:
        item["incoming_quantity"] = incoming.get(item["raw_material_id"], 0.0)
        req = requirements.get(item["raw_material_id"])
        if req:
            item["required_quantity"] = req["total_required"]
            item["shortfall"] = req["shortfall"]
    result["items"] = [RawMaterialStockItem.model_validate(i) for i in result["items"]]
    return result


@router.get("/stock/{item_type}/{item_id}", response_model=StockLevelOut)
def get_stock(
    item_type: str,
    item_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(read_guard),
):
    return inventory_service.get_stock(db, item_type, item_id)


@router.post("/adjust", response_model=StockAdjustmentResultOut)
def adjust_stock(
    payload: StockAdjustRequest,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    """The only person-driven stock adjustment path -- always requires a
    reason, and is held for admin approval instead of applying
    immediately once the adjustment is large enough (see
    inventory_service.submit_manual_adjustment)."""
    result = inventory_service.submit_manual_adjustment(
        db,
        item_type=payload.item_type,
        item_id=payload.item_id,
        quantity=payload.quantity,
        movement_type=payload.movement_type,
        reason=payload.notes,
        user_id=user.id,
        supplier_id=payload.supplier_id,
        unit_cost=payload.unit_cost,
        batch_number=payload.batch_number,
        expiry_date=payload.expiry_date,
        invoice_number=payload.invoice_number,
        received_by=payload.received_by,
        received_date=payload.received_date,
    )
    return StockAdjustmentResultOut(
        status=result["status"],
        stock=StockLevelOut(**result["stock"]) if result["stock"] else None,
        request=StockAdjustmentRequestOut.model_validate(result["request"]) if result["request"] else None,
    )


@router.get("/adjustment-requests", response_model=PagedResponse)
def list_adjustment_requests(
    status: str | None = Query(None, pattern="^(pending|applied|rejected)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=200),
    sort: str | None = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(read_guard),
):
    result = inventory_service.list_stock_adjustment_requests(
        db, status=status, page=page, page_size=page_size, sort=sort
    )
    result["items"] = [StockAdjustmentRequestOut.model_validate(r) for r in result["items"]]
    return result


@router.post("/adjustment-requests/{request_id}/approve", response_model=StockAdjustmentRequestOut)
def approve_adjustment_request(
    request_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(admin_guard),
):
    request = inventory_service.approve_stock_adjustment_request(db, request_id, user_id=user.id)
    return StockAdjustmentRequestOut.model_validate(request)


@router.post("/adjustment-requests/{request_id}/reject", response_model=StockAdjustmentRequestOut)
def reject_adjustment_request(
    request_id: int,
    payload: StockAdjustmentRejectRequest,
    db: Session = Depends(get_db),
    user: User = Depends(admin_guard),
):
    request = inventory_service.reject_stock_adjustment_request(db, request_id, payload.reason, user_id=user.id)
    return StockAdjustmentRequestOut.model_validate(request)


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
