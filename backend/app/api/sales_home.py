from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.exceptions import PermissionError_
from app.core.permissions import is_admin, is_department_head, require_page_access
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


@router.get("/salesmen")
def list_assignable_salesmen(
    db: Session = Depends(get_db),
    user: User = Depends(read_guard),
):
    """Who a customer can be assigned to -- every Sales salesman, plus
    the Sales Manager(s) themselves and every admin (see
    sales_home_service.list_assignable_customer_owners: a manager needs
    to pull a customer back onto their own plate or an admin's, not just
    hand it to another salesman). Only those who can assign (Sales
    Manager / admin) may ask -- and this is how they can: the general
    /api/users lookup is admin-only, which left the Sales Manager with
    an empty reassign dropdown."""
    if not (is_admin(user) or is_department_head(user)):
        raise PermissionError_()
    return [{"id": s.id, "full_name": s.full_name} for s in sales_home_service.list_assignable_customer_owners(db)]
