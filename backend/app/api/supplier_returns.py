from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.common import PagedResponse
from app.api.deps import require_role
from app.core.database import get_db
from app.core.permissions import require_page_access
from app.models.user import User
from app.schemas.supplier_return import SupplierReturnCreate, SupplierReturnOut
from app.services import audit_service, supplier_return_service

router = APIRouter(prefix="/api/supplier-returns", tags=["supplier-returns"])
read_guard = require_page_access("supplier_returns", "read")
write_guard = require_page_access("supplier_returns", "write")
# Reversing a return (deleting it) puts stock back and rewrites what was
# recorded as having happened -- admin-only, same as reversing a payment.
admin_guard = require_role("admin")


@router.get("", response_model=PagedResponse)
def list_supplier_returns(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=200),
    search: str | None = Query(None),
    supplier_id: int | None = Query(None),
    sort: str | None = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(read_guard),
):
    result = supplier_return_service.list_supplier_returns(
        db, page=page, page_size=page_size, search=search, supplier_id=supplier_id, sort=sort
    )
    result["items"] = [SupplierReturnOut.from_model(r) for r in result["items"]]
    return result


@router.get("/{return_id}", response_model=SupplierReturnOut)
def get_supplier_return(
    return_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(read_guard),
):
    return SupplierReturnOut.from_model(supplier_return_service.get_supplier_return(db, return_id))


@router.get("/{return_id}/history")
def get_supplier_return_history(
    return_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(read_guard),
):
    supplier_return_service.get_supplier_return(db, return_id, include_deleted=True)  # 404s if never existed
    return audit_service.get_history(db, "supplier_returns", return_id)


@router.post("", response_model=SupplierReturnOut, status_code=201)
def create_supplier_return(
    payload: SupplierReturnCreate,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    data = payload.model_dump()
    supplier_return = supplier_return_service.create_supplier_return(db, data, user_id=user.id)
    return SupplierReturnOut.from_model(supplier_return)


@router.delete("/{return_id}")
def delete_supplier_return(
    return_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(admin_guard),
):
    supplier_return_service.delete_supplier_return(db, return_id, user_id=user.id)
    return {"message": "Reversed."}
