from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
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


def _validate_date_range(date_from: date | None, date_to: date | None) -> None:
    """The "to" side of a report's date range can be any past date up to
    today, never in the future -- report_service.py's _resolve_range
    would silently clamp this, but a report is a case where telling the
    user their filter was rejected beats quietly showing them a
    different range than the one they asked for.
    """
    if date_to is not None and date_to > date.today():
        raise HTTPException(status_code=400, detail="To date cannot be in the future")


@router.get("/sales", response_model=SalesReportOut)
def get_sales_report(
    months: int = Query(default=12, ge=1, le=36),
    date_from: date | None = None,
    date_to: date | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(sales_read_guard),
):
    _validate_date_range(date_from, date_to)
    return report_service.get_sales_report(db, months=months, date_from=date_from, date_to=date_to)


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
    date_from: date | None = None,
    date_to: date | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(production_read_guard),
):
    _validate_date_range(date_from, date_to)
    return report_service.get_production_report(db, months=months, date_from=date_from, date_to=date_to)


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
    date_from: date | None = None,
    date_to: date | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(purchasing_read_guard),
):
    _validate_date_range(date_from, date_to)
    return report_service.get_purchasing_report(db, months=months, date_from=date_from, date_to=date_to)


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
    date_from: date | None = None,
    date_to: date | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(inventory_read_guard),
):
    _validate_date_range(date_from, date_to)
    return report_service.get_inventory_report(db, months=months, date_from=date_from, date_to=date_to)


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
