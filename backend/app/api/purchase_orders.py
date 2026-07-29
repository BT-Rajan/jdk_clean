from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.common import PagedResponse
from app.api.deps import get_current_user, require_department_write
from app.core.database import get_db
from app.models.user import User
from app.schemas.purchase_order import (
    PurchaseOrderCreate,
    PurchaseOrderOut,
    PurchaseOrderStatusUpdate,
    PurchaseOrderUpdate,
    ReceivePurchaseOrder,
)
from app.services import audit_service, purchase_order_service

router = APIRouter(prefix="/api/purchase-orders", tags=["purchase-orders"])
write_guard = require_department_write("procurement")


@router.get("", response_model=PagedResponse)
def list_purchase_orders(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=200),
    search: str | None = Query(None),
    status: str | None = Query(None),
    supplier_id: int | None = Query(None),
    sort: str | None = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = purchase_order_service.list_purchase_orders(
        db, page=page, page_size=page_size, search=search, status=status, supplier_id=supplier_id, sort=sort
    )
    result["items"] = [PurchaseOrderOut.from_model(po) for po in result["items"]]
    return result


@router.get("/{po_id}", response_model=PurchaseOrderOut)
def get_purchase_order(
    po_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return PurchaseOrderOut.from_model(purchase_order_service.get_purchase_order(db, po_id))


@router.get("/{po_id}/history")
def get_purchase_order_history(
    po_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    purchase_order_service.get_purchase_order(db, po_id, include_deleted=True)  # 404s if never existed
    return audit_service.get_history(db, "purchase_orders", po_id)


@router.post("", response_model=PurchaseOrderOut, status_code=201)
def create_purchase_order(
    payload: PurchaseOrderCreate,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    data = payload.model_dump()
    po = purchase_order_service.create_purchase_order(db, data, user_id=user.id)
    return PurchaseOrderOut.from_model(po)


@router.put("/{po_id}", response_model=PurchaseOrderOut)
def update_purchase_order(
    po_id: int,
    payload: PurchaseOrderUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    data = payload.model_dump(exclude_unset=True)
    po = purchase_order_service.update_purchase_order(db, po_id, data, user_id=user.id)
    return PurchaseOrderOut.from_model(po)


@router.post("/{po_id}/status", response_model=PurchaseOrderOut)
def update_status(
    po_id: int,
    payload: PurchaseOrderStatusUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    po = purchase_order_service.change_status(db, po_id, payload.status, user_id=user.id)
    return PurchaseOrderOut.from_model(po)


@router.post("/{po_id}/receive", response_model=PurchaseOrderOut)
def receive_purchase_order(
    po_id: int,
    payload: ReceivePurchaseOrder,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    receipts = [line.model_dump() for line in payload.lines]
    po = purchase_order_service.receive_lines(db, po_id, receipts, user_id=user.id)
    return PurchaseOrderOut.from_model(po)


@router.delete("/{po_id}")
def delete_purchase_order(
    po_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    purchase_order_service.delete_purchase_order(db, po_id, user_id=user.id)
    return {"message": "Deleted."}


@router.post("/{po_id}/restore", response_model=PurchaseOrderOut)
def restore_purchase_order(
    po_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    po = purchase_order_service.restore_purchase_order(db, po_id, user_id=user.id)
    return PurchaseOrderOut.from_model(po)
