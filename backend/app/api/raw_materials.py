from fastapi import Depends
from sqlalchemy.orm import Session

from app.api.common import build_crud_router
from app.core.database import get_db
from app.core.permissions import require_page_access
from app.crud.master_data import raw_material_crud
from app.models.supplier_material import SupplierMaterial
from app.models.raw_material_alternative import RawMaterialAlternative
from app.models.user import User
from app.schemas.raw_material import RawMaterialCreate, RawMaterialOut, RawMaterialUpdate
from app.schemas.raw_material_alternative import (
    RawMaterialAlternativeIn,
    RawMaterialAlternativeOut,
    RawMaterialAlternativeUpdate,
)
from app.schemas.supplier_material import (
    SupplierMaterialForMaterialIn,
    SupplierMaterialLineUpdate,
    SupplierMaterialOut,
)
from app.services import raw_material_alternative_service, supplier_material_service, where_used_service

router = build_crud_router(
    crud=raw_material_crud,
    create_schema=RawMaterialCreate,
    update_schema=RawMaterialUpdate,
    out_schema=RawMaterialOut,
    prefix="/api/raw-materials",
    tags=["raw-materials"],
    page_key="raw_materials",
)

read_guard = require_page_access("raw_materials", "read")
write_guard = require_page_access("raw_materials", "write")


@router.get("/{raw_material_id}/where-used")
def get_raw_material_where_used(
    raw_material_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(read_guard),
):
    """Read-only, computed from live relationships (BOMs, packaging,
    suppliers, purchase orders) -- see app/services/where_used_service.py."""
    raw_material_crud.read_one(db, raw_material_id)  # 404s if it doesn't exist
    return where_used_service.raw_material_usage(db, raw_material_id)


def _supplier_material_to_out(line: SupplierMaterial) -> SupplierMaterialOut:
    return SupplierMaterialOut(
        id=line.id,
        supplier_id=line.supplier_id,
        raw_material_id=line.raw_material_id,
        supplier_code=line.supplier.code if line.supplier else None,
        supplier_name=line.supplier.name if line.supplier else None,
        material_code=line.raw_material.code if line.raw_material else None,
        material_name=line.raw_material.name if line.raw_material else None,
        material_unit=line.raw_material.unit if line.raw_material else None,
        supplier_material_code=line.supplier_material_code,
        purchase_price=line.purchase_price,
        currency=line.currency,
        max_supply_quantity=line.max_supply_quantity,
        lead_time_days=line.lead_time_days,
        moq=line.moq,
        is_preferred=line.is_preferred,
        status=line.status,
        onboarded_at=line.onboarded_at,
        last_transaction_at=line.last_transaction_at,
        created_at=line.created_at,
        updated_at=line.updated_at,
    )


@router.get("/{raw_material_id}/suppliers", response_model=list[SupplierMaterialOut])
def get_material_suppliers(
    raw_material_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(read_guard),
):
    """Procurement view: every supplier qualified to provide this
    material, with per-supplier price/terms -- the material-owned mirror
    of GET /api/suppliers/{id}/materials. See
    app/services/supplier_material_service.py's MaterialSupplierCRUD."""
    lines = supplier_material_service.get_suppliers_for_material(db, raw_material_id)
    return [_supplier_material_to_out(line) for line in lines]


@router.post("/{raw_material_id}/suppliers", response_model=SupplierMaterialOut, status_code=201)
def add_material_supplier(
    raw_material_id: int,
    payload: SupplierMaterialForMaterialIn,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    line = supplier_material_service.add_supplier_for_material(
        db, raw_material_id, payload.model_dump(), user_id=user.id
    )
    return _supplier_material_to_out(line)


@router.put("/{raw_material_id}/suppliers/{line_id}", response_model=SupplierMaterialOut)
def update_material_supplier(
    raw_material_id: int,
    line_id: int,
    payload: SupplierMaterialLineUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    line = supplier_material_service.update_supplier_material_line(
        db, raw_material_id, line_id, payload.model_dump(exclude_unset=True), user_id=user.id
    )
    return _supplier_material_to_out(line)


@router.delete("/{raw_material_id}/suppliers/{line_id}")
def delete_material_supplier(
    raw_material_id: int,
    line_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    supplier_material_service.remove_supplier_material_line(db, raw_material_id, line_id, user_id=user.id)
    return {"message": "Deleted."}


def _alternative_to_out(line: RawMaterialAlternative) -> RawMaterialAlternativeOut:
    alt = line.alternative_material
    return RawMaterialAlternativeOut(
        id=line.id,
        raw_material_id=line.raw_material_id,
        alternative_material_id=line.alternative_material_id,
        alternative_code=alt.code if alt else None,
        alternative_name=alt.name if alt else None,
        alternative_unit=alt.unit if alt else None,
        priority=line.priority,
        status=line.status,
        conversion_ratio=line.conversion_ratio,
        notes=line.notes,
        created_at=line.created_at,
        updated_at=line.updated_at,
    )


@router.get("/{raw_material_id}/alternatives", response_model=list[RawMaterialAlternativeOut])
def get_material_alternatives(
    raw_material_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(read_guard),
):
    lines = raw_material_alternative_service.get_alternatives(db, raw_material_id)
    return [_alternative_to_out(line) for line in lines]


@router.post("/{raw_material_id}/alternatives", response_model=RawMaterialAlternativeOut, status_code=201)
def add_material_alternative(
    raw_material_id: int,
    payload: RawMaterialAlternativeIn,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    line = raw_material_alternative_service.add_alternative(
        db, raw_material_id, payload.model_dump(), user_id=user.id
    )
    return _alternative_to_out(line)


@router.put("/{raw_material_id}/alternatives/{alternative_id}", response_model=RawMaterialAlternativeOut)
def update_material_alternative(
    raw_material_id: int,
    alternative_id: int,
    payload: RawMaterialAlternativeUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    line = raw_material_alternative_service.update_alternative(
        db, raw_material_id, alternative_id, payload.model_dump(exclude_unset=True), user_id=user.id
    )
    return _alternative_to_out(line)


@router.delete("/{raw_material_id}/alternatives/{alternative_id}")
def delete_material_alternative(
    raw_material_id: int,
    alternative_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    raw_material_alternative_service.remove_alternative(db, raw_material_id, alternative_id, user_id=user.id)
    return {"message": "Deleted."}
