from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.common import PagedResponse
from app.core.database import get_db
from app.core.permissions import require_page_access
from app.models.user import User
from app.schemas.production_schedule import (
    MaterialRequirementOut,
    ProductionQuickLog,
    ProductionScheduleCreate,
    ProductionScheduleOut,
    ProductionScheduleStatusUpdate,
    ProductionScheduleUpdate,
)
from app.services import audit_service, production_service

router = APIRouter(prefix="/api/production-schedules", tags=["production"])
read_guard = require_page_access("production", "read")
write_guard = require_page_access("production", "write")


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
    _: User = Depends(read_guard),
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
    _: User = Depends(read_guard),
):
    return ProductionScheduleOut.from_model(production_service.get_batch(db, batch_id))


@router.get("/{batch_id}/history")
def get_batch_history(
    batch_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(read_guard),
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


@router.post("/log", response_model=ProductionScheduleOut, status_code=201)
def log_production(
    payload: ProductionQuickLog,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    """One-click entry for production that's already happened -- creates
    and completes a batch in a single call instead of planning, starting,
    then completing it by hand. See production_service.log_production."""
    batch = production_service.log_production(
        db, payload.product_id, payload.quantity, notes=payload.notes, entry_date=payload.entry_date, user_id=user.id
    )
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


@router.get("/{batch_id}/material-requirements", response_model=list[MaterialRequirementOut])
def get_material_requirements(
    batch_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(read_guard),
):
    """Per-raw-material breakdown for this batch's planned run -- net
    (zero-scrap) requirement, the BOM's scrap-inflated figure, and current
    stock -- for the "Complete batch" screen to show alongside an actual-
    quantity input per material."""
    return production_service.get_material_requirements(db, batch_id)


@router.post("/{batch_id}/status", response_model=ProductionScheduleOut)
def update_status(
    batch_id: int,
    payload: ProductionScheduleStatusUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    actual_materials = (
        {m.raw_material_id: m.quantity_used for m in payload.actual_materials}
        if payload.actual_materials
        else None
    )
    batch = production_service.change_status(
        db,
        batch_id,
        payload.status,
        produced_quantity=payload.produced_quantity,
        actual_materials=actual_materials,
        reason=payload.reason,
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
