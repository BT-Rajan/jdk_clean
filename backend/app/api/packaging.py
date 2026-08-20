from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_role
from app.core.database import get_db
from app.models.user import User
from app.schemas.packaging import PackagingLineIn, PackagingLineOut, PackagingReplace
from app.services import audit_service, packaging_service

router = APIRouter(prefix="/api/products/{product_id}/packaging", tags=["packaging"])
write_guard = require_role("admin", "manager")


@router.get("", response_model=list[PackagingLineOut])
def get_packaging(
    product_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
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
    _: User = Depends(get_current_user),
):
    return audit_service.get_history(db, "product_packaging_lines", product_id)
