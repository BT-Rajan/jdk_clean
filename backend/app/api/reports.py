from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.permissions import require_page_access
from app.models.user import User
from app.schemas.report import (
    InventoryDrilldownOut,
    InventoryReportOut,
    ProductionDrilldownOut,
    ProductionReportOut,
    PurchasingDrilldownOut,
    PurchasingReportOut,
    SalesDrilldownOut,
    SalesReportOut,
)
from app.services import report_service

router = APIRouter(prefix="/api/reports", tags=["reports"])

# Each report is gated by the page_key of the record type it's derived
# from, rather than a whole new "reports" page_key per report -- see
# mrp.py for the identical single-guard pattern on another
# aggregation-only endpoint.
sales_read_guard = require_page_access("orders", "read")
production_read_guard = require_page_access("production", "read")
purchasing_read_guard = require_page_access("purchase_orders", "read")
inventory_read_guard = require_page_access("inventory", "read")


@router.get("/sales", response_model=SalesReportOut)
def get_sales_report(
    months: int = Query(default=12, ge=1, le=36),
    db: Session = Depends(get_db),
    _: User = Depends(sales_read_guard),
):
    return report_service.get_sales_report(db, months=months)


@router.get("/sales/drilldown", response_model=SalesDrilldownOut)
def get_sales_drilldown(
    year: int | None = None,
    month: int | None = Query(default=None, ge=1, le=12),
    status: str | None = None,
    customer_id: int | None = None,
    product_id: int | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(sales_read_guard),
):
    items = report_service.get_sales_drilldown(
        db, year=year, month=month, status=status, customer_id=customer_id, product_id=product_id
    )
    return {"items": items, "total_count": len(items)}


@router.get("/production", response_model=ProductionReportOut)
def get_production_report(
    months: int = Query(default=12, ge=1, le=36),
    db: Session = Depends(get_db),
    _: User = Depends(production_read_guard),
):
    return report_service.get_production_report(db, months=months)


@router.get("/production/drilldown", response_model=ProductionDrilldownOut)
def get_production_drilldown(
    year: int | None = None,
    month: int | None = Query(default=None, ge=1, le=12),
    status: str | None = None,
    product_id: int | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(production_read_guard),
):
    items = report_service.get_production_drilldown(db, year=year, month=month, status=status, product_id=product_id)
    return {"items": items, "total_count": len(items)}


@router.get("/purchasing", response_model=PurchasingReportOut)
def get_purchasing_report(
    months: int = Query(default=12, ge=1, le=36),
    db: Session = Depends(get_db),
    _: User = Depends(purchasing_read_guard),
):
    return report_service.get_purchasing_report(db, months=months)


@router.get("/purchasing/drilldown", response_model=PurchasingDrilldownOut)
def get_purchasing_drilldown(
    year: int | None = None,
    month: int | None = Query(default=None, ge=1, le=12),
    status: str | None = None,
    supplier_id: int | None = None,
    raw_material_id: int | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(purchasing_read_guard),
):
    items = report_service.get_purchasing_drilldown(
        db, year=year, month=month, status=status, supplier_id=supplier_id, raw_material_id=raw_material_id
    )
    return {"items": items, "total_count": len(items)}


@router.get("/inventory", response_model=InventoryReportOut)
def get_inventory_report(
    months: int = Query(default=12, ge=1, le=36),
    db: Session = Depends(get_db),
    _: User = Depends(inventory_read_guard),
):
    return report_service.get_inventory_report(db, months=months)


@router.get("/inventory/drilldown", response_model=InventoryDrilldownOut)
def get_inventory_drilldown(
    year: int | None = None,
    month: int | None = Query(default=None, ge=1, le=12),
    movement_type: str | None = None,
    item_type: str | None = None,
    item_id: int | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(inventory_read_guard),
):
    items = report_service.get_inventory_drilldown(
        db, year=year, month=month, movement_type=movement_type, item_type=item_type, item_id=item_id
    )
    return {"items": items, "total_count": len(items)}
