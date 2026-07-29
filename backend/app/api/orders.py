from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.common import PagedResponse
from app.api.deps import get_current_user, require_department_write
from app.core.database import get_db
from app.models.user import User
from app.schemas.order import OrderCreate, OrderOut, OrderStatusUpdate, OrderUpdate
from app.services import audit_service, order_service

router = APIRouter(prefix="/api/orders", tags=["orders"])
write_guard = require_department_write("sales")


@router.get("", response_model=PagedResponse)
def list_orders(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=200),
    search: str | None = Query(None),
    status: str | None = Query(None),
    customer_id: int | None = Query(None),
    sort: str | None = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = order_service.list_orders(
        db, page=page, page_size=page_size, search=search, status=status, customer_id=customer_id, sort=sort
    )
    result["items"] = [OrderOut.from_model(o) for o in result["items"]]
    return result


@router.get("/{order_id}", response_model=OrderOut)
def get_order(
    order_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return OrderOut.from_model(order_service.get_order(db, order_id))


@router.get("/{order_id}/history")
def get_order_history(
    order_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    order_service.get_order(db, order_id, include_deleted=True)  # 404s if never existed
    return audit_service.get_history(db, "orders", order_id)


@router.post("", response_model=OrderOut, status_code=201)
def create_order(
    payload: OrderCreate,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    data = payload.model_dump()
    order = order_service.create_order(db, data, user_id=user.id)
    return OrderOut.from_model(order)


@router.post("/from-quotation/{quotation_id}", response_model=OrderOut, status_code=201)
def create_order_from_quotation(
    quotation_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    order = order_service.create_order_from_quotation(db, quotation_id, user_id=user.id)
    return OrderOut.from_model(order)


@router.put("/{order_id}", response_model=OrderOut)
def update_order(
    order_id: int,
    payload: OrderUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    data = payload.model_dump(exclude_unset=True)
    order = order_service.update_order(db, order_id, data, user_id=user.id)
    return OrderOut.from_model(order)


@router.post("/{order_id}/status", response_model=OrderOut)
def update_status(
    order_id: int,
    payload: OrderStatusUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    order = order_service.change_status(db, order_id, payload.status, user_id=user.id)
    return OrderOut.from_model(order)


@router.delete("/{order_id}")
def delete_order(
    order_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    order_service.delete_order(db, order_id, user_id=user.id)
    return {"message": "Deleted."}


@router.post("/{order_id}/restore", response_model=OrderOut)
def restore_order(
    order_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    order = order_service.restore_order(db, order_id, user_id=user.id)
    return OrderOut.from_model(order)
