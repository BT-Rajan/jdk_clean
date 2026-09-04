from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.permissions import require_page_access
from app.models.user import User
from app.schemas.report import SalesDrilldownOut, SalesReportOut
from app.services import report_service

router = APIRouter(prefix="/api/reports", tags=["reports"])

# Sales-report data is entirely order/quotation derived, so it's gated
# the same as Orders itself rather than adding a whole new page_key for
# a single read-only report -- see mrp.py for the identical single-guard
# pattern on another aggregation-only endpoint.
read_guard = require_page_access("orders", "read")


@router.get("/sales", response_model=SalesReportOut)
def get_sales_report(
    months: int = Query(default=12, ge=1, le=36),
    db: Session = Depends(get_db),
    _: User = Depends(read_guard),
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
    _: User = Depends(read_guard),
):
    items = report_service.get_sales_drilldown(
        db, year=year, month=month, status=status, customer_id=customer_id, product_id=product_id
    )
    return {"items": items, "total_count": len(items)}
