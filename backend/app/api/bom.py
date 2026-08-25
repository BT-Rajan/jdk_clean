from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import require_role
from app.core.database import get_db
from app.models.raw_material import RawMaterial
from app.models.user import User
from app.schemas.bom import (
    BomExplosionResult,
    BomLineIn,
    BomLineOut,
    BomReplace,
    RequirementLine,
)
from app.services import audit_service, bom_service

router = APIRouter(prefix="/api/products/{product_id}/bom", tags=["bom"])
# A product's BOM is its "formula" -- the raw-material mix and quantities
# that make it, which is exactly the kind of thing a competitor or a
# departing employee would want. Admin-only for read AND write, not the
# admin/manager split used elsewhere in this app -- deliberately stricter
# than every other master-data module.
read_guard = require_role("admin")
write_guard = require_role("admin")


@router.get("", response_model=list[BomLineOut])
def get_bom(
    product_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(read_guard),
):
    return bom_service.get_bom(db, product_id)


@router.put("", response_model=list[BomLineOut])
def replace_bom(
    product_id: int,
    payload: BomReplace,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    lines = [line.model_dump() for line in payload.lines]
    return bom_service.replace_bom(db, product_id, lines, user_id=user.id)


@router.post("/lines", response_model=BomLineOut, status_code=201)
def add_bom_line(
    product_id: int,
    payload: BomLineIn,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    return bom_service.add_bom_line(db, product_id, payload.model_dump(), user_id=user.id)


@router.delete("/lines/{line_id}")
def delete_bom_line(
    product_id: int,
    line_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    bom_service.delete_bom_line(db, product_id, line_id, user_id=user.id)
    return {"message": "Deleted."}


@router.get("/history")
def get_bom_history(
    product_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(read_guard),
):
    return audit_service.get_history(db, "bom_lines", product_id)


@router.get("/explode", response_model=BomExplosionResult)
def explode_bom(
    product_id: int,
    quantity: float = Query(gt=0),
    db: Session = Depends(get_db),
    _: User = Depends(read_guard),
):
    totals = bom_service.explode_requirements(db, product_id, quantity)
    materials = {
        m.id: m for m in db.query(RawMaterial).filter(RawMaterial.id.in_(totals.keys())).all()
    } if totals else {}

    requirements = [
        RequirementLine(
            raw_material_id=raw_material_id,
            code=materials[raw_material_id].code if raw_material_id in materials else None,
            name=materials[raw_material_id].name if raw_material_id in materials else None,
            unit=materials[raw_material_id].unit if raw_material_id in materials else None,
            quantity_required=round(qty, 4),
        )
        for raw_material_id, qty in totals.items()
    ]
    requirements.sort(key=lambda r: r.name or "")

    return BomExplosionResult(
        product_id=product_id, quantity_requested=quantity, requirements=requirements
    )
