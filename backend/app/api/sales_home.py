from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.permissions import require_page_access
from app.models.user import User
from app.schemas.sales_home import SalesHomeOut
from app.services import sales_home_service

router = APIRouter(prefix="/api/sales", tags=["sales"])
# /sales maps to the 'orders' page key on the frontend (lib/pagePermissions).
read_guard = require_page_access("orders", "read")


@router.get("/home", response_model=SalesHomeOut)
def sales_home(
    db: Session = Depends(get_db),
    user: User = Depends(read_guard),
):
    """Compact Sales workspace: scoped counts + next actions for a
    salesman; department-wide plus a per-salesman workload table for the
    Sales Manager / admin."""
    return sales_home_service.get_sales_home(db, user)
