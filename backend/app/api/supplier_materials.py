from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_role
from app.core.database import get_db
from app.models.supplier_material import SupplierMaterial
from app.models.user import User
from app.schemas.supplier_material import SupplierMaterialOut, SupplierMaterialsReplace
from app.services import supplier_material_service

router = APIRouter(prefix="/api/suppliers/{supplier_id}/materials", tags=["suppliers"])
write_guard = require_role("admin", "manager")


def _to_out(line: SupplierMaterial) -> SupplierMaterialOut:
    return SupplierMaterialOut(
        id=line.id,
        supplier_id=line.supplier_id,
        raw_material_id=line.raw_material_id,
        material_code=line.raw_material.code if line.raw_material else None,
        material_name=line.raw_material.name if line.raw_material else None,
        material_unit=line.raw_material.unit if line.raw_material else None,
        max_supply_quantity=line.max_supply_quantity,
        lead_time_days=line.lead_time_days,
        onboarded_at=line.onboarded_at,
        last_transaction_at=line.last_transaction_at,
        created_at=line.created_at,
        updated_at=line.updated_at,
    )


@router.get("", response_model=list[SupplierMaterialOut])
def get_materials(
    supplier_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return [_to_out(line) for line in supplier_material_service.get_materials(db, supplier_id)]


@router.put("", response_model=list[SupplierMaterialOut])
def replace_materials(
    supplier_id: int,
    payload: SupplierMaterialsReplace,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    lines = [line.model_dump() for line in payload.lines]
    result = supplier_material_service.replace_materials(db, supplier_id, lines, user_id=user.id)
    return [_to_out(line) for line in result]
