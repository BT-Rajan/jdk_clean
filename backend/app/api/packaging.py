from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.permissions import require_page_access
from app.models.user import User
from app.schemas.packaging import PackagingLineIn, PackagingLineOut, PackagingReplace
from app.services import audit_service, packaging_service

router = APIRouter(prefix="/api/products/{product_id}/packaging", tags=["packaging"])
# P11: this router predated the page-permission system and was left on
# get_current_user (any authenticated account) for reads and a bare
# admin/manager role check for writes -- unlike a BOM's raw-material
# formula (see bom.py's own comment), packaging composition isn't
# sensitive enough to warrant admin-only, but it should still respect the
# same "products" department permission every other product-related
# endpoint already does.
read_guard = require_page_access("products", "read")
write_guard = require_page_access("products", "write")


@router.get("", response_model=list[PackagingLineOut])
def get_packaging(
    product_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(read_guard),
):
    return packaging_service.get_packaging(db, product_id)


@router.put("", response_model=list[PackagingLineOut])
def replace_packaging(
    product_id: int,
    payload: PackagingReplace,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    lines = [line.model_dump() for line in payload.lines]
    return packaging_service.replace_packaging(db, product_id, lines, user_id=user.id)


@router.post("/lines", response_model=PackagingLineOut, status_code=201)
def add_packaging_line(
    product_id: int,
    payload: PackagingLineIn,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    return packaging_service.add_packaging_line(db, product_id, payload.model_dump(), user_id=user.id)


@router.delete("/lines/{line_id}")
def delete_packaging_line(
    product_id: int,
    line_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    packaging_service.delete_packaging_line(db, product_id, line_id, user_id=user.id)
    return {"message": "Deleted."}


@router.get("/history")
def get_packaging_history(
    product_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(read_guard),
):
    return audit_service.get_history(db, "product_packaging_lines", product_id)
