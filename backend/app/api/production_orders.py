from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.common import PagedResponse
from app.core.database import get_db
from app.core.permissions import require_page_access
from app.models.user import User
from app.schemas.production_order import ProductionOrderCreate, ProductionOrderOut, ProductionOrderStatusUpdate
from app.services import audit_service, production_order_service

router = APIRouter(prefix="/api/production-orders", tags=["production"])
# Reuses the existing "production" page key rather than introducing a
# new one -- Production Orders are part of the same Production section
# the department_permissions matrix already governs for production
# schedules; a separate key would just be a second knob for the exact
# same audience to configure identically.
read_guard = require_page_access("production", "read")
write_guard = require_page_access("production", "write")


def _with_remaining(db: Session, po, out: ProductionOrderOut) -> ProductionOrderOut:
    out.remaining_order_quantity = production_order_service.get_remaining_quantity(db, po.order_detail_id)
    return out


@router.get("", response_model=PagedResponse)
def list_production_orders(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=200),
    search: str | None = Query(None),
    status: str | None = Query(None),
    order_id: int | None = Query(None),
    order_detail_id: int | None = Query(None),
    product_id: int | None = Query(None),
    sort: str | None = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(read_guard),
):
    result = production_order_service.list_production_orders(
        db,
        page=page,
        page_size=page_size,
        search=search,
        status=status,
        order_id=order_id,
        order_detail_id=order_detail_id,
        product_id=product_id,
        sort=sort,
    )
    result["items"] = [_with_remaining(db, po, ProductionOrderOut.from_model(po)) for po in result["items"]]
    return result


@router.get("/{production_order_id}", response_model=ProductionOrderOut)
def get_production_order(
    production_order_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(read_guard),
):
    po = production_order_service.get_production_order(db, production_order_id)
    return _with_remaining(db, po, ProductionOrderOut.from_model(po))


@router.get("/{production_order_id}/history")
def get_production_order_history(
    production_order_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(read_guard),
):
    production_order_service.get_production_order(db, production_order_id)  # 404s if missing
    return audit_service.get_history(db, "production_orders", production_order_id)


@router.post("", response_model=ProductionOrderOut, status_code=201)
def create_production_order(
    payload: ProductionOrderCreate,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    po = production_order_service.create_production_order(db, payload.model_dump(), user_id=user.id)
    return _with_remaining(db, po, ProductionOrderOut.from_model(po))


@router.post("/{production_order_id}/status", response_model=ProductionOrderOut)
def update_status(
    production_order_id: int,
    payload: ProductionOrderStatusUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    po = production_order_service.change_status(
        db, production_order_id, payload.status, reason=payload.reason, user_id=user.id
    )
    return _with_remaining(db, po, ProductionOrderOut.from_model(po))
