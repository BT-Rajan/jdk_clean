from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.common import PagedResponse
from app.api.deps import get_current_user, require_role
from app.core.database import get_db
from app.models.user import User
from app.schemas.production_schedule import (
    ProductionScheduleCreate,
    ProductionScheduleOut,
    ProductionScheduleStatusUpdate,
    ProductionScheduleUpdate,
)
from app.services import audit_service, production_service

router = APIRouter(prefix="/api/production-schedules", tags=["production"])
write_guard = require_role("admin", "manager")


@router.get("", response_model=PagedResponse)
def list_batches(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=200),
    search: str | None = Query(None),
    status: str | None = Query(None),
    product_id: int | None = Query(None),
    order_id: int | None = Query(None),
    sort: str | None = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = production_service.list_batches(
        db,
        page=page,
        page_size=page_size,
        search=search,
        status=status,
        product_id=product_id,
        order_id=order_id,
        sort=sort,
    )
    result["items"] = [ProductionScheduleOut.from_model(b) for b in result["items"]]
    return result


@router.get("/{batch_id}", response_model=ProductionScheduleOut)
def get_batch(
    batch_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return ProductionScheduleOut.from_model(production_service.get_batch(db, batch_id))


@router.get("/{batch_id}/history")
def get_batch_history(
    batch_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    production_service.get_batch(db, batch_id, include_deleted=True)  # 404s if never existed
    return audit_service.get_history(db, "production_schedules", batch_id)


@router.post("", response_model=ProductionScheduleOut, status_code=201)
def create_batch(
    payload: ProductionScheduleCreate,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    batch = production_service.create_batch(db, payload.model_dump(), user_id=user.id)
    return ProductionScheduleOut.from_model(batch)


@router.put("/{batch_id}", response_model=ProductionScheduleOut)
def update_batch(
    batch_id: int,
    payload: ProductionScheduleUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    data = payload.model_dump(exclude_unset=True)
    batch = production_service.update_batch(db, batch_id, data, user_id=user.id)
    return ProductionScheduleOut.from_model(batch)


@router.post("/{batch_id}/status", response_model=ProductionScheduleOut)
def update_status(
    batch_id: int,
    payload: ProductionScheduleStatusUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    batch = production_service.change_status(
        db,
        batch_id,
        payload.status,
        produced_quantity=payload.produced_quantity,
        user_id=user.id,
    )
    return ProductionScheduleOut.from_model(batch)


@router.delete("/{batch_id}")
def delete_batch(
    batch_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    production_service.delete_batch(db, batch_id, user_id=user.id)
    return {"message": "Deleted."}


@router.post("/{batch_id}/restore", response_model=ProductionScheduleOut)
def restore_batch(
    batch_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    batch = production_service.restore_batch(db, batch_id, user_id=user.id)
    return ProductionScheduleOut.from_model(batch)
