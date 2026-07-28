from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError, ValidationAppError
from app.models.raw_material import RawMaterial
from app.models.supplier import Supplier
from app.models.supplier_material import SupplierMaterial
from app.services import audit_service

TABLE_NAME = "supplier_materials"


def _get_active_supplier(db: Session, supplier_id: int) -> Supplier:
    supplier = (
        db.query(Supplier)
        .filter(Supplier.id == supplier_id, Supplier.deleted_at.is_(None))
        .first()
    )
    if supplier is None:
        raise NotFoundError("Supplier")
    return supplier


def _validate_material_exists(db: Session, raw_material_id: int) -> None:
    material = (
        db.query(RawMaterial)
        .filter(RawMaterial.id == raw_material_id, RawMaterial.deleted_at.is_(None))
        .first()
    )
    if material is None:
        raise ValidationAppError(f"Raw material {raw_material_id} not found.")


def get_materials(db: Session, supplier_id: int) -> list[SupplierMaterial]:
    _get_active_supplier(db, supplier_id)
    return (
        db.query(SupplierMaterial)
        .filter(SupplierMaterial.supplier_id == supplier_id, SupplierMaterial.deleted_at.is_(None))
        .order_by(SupplierMaterial.id)
        .all()
    )


def replace_materials(
    db: Session, supplier_id: int, lines: list[dict], user_id: int | None = None
) -> list[SupplierMaterial]:
    """Replaces the entire set of materials a supplier can supply, mirroring
    bom_service.replace_bom's same soft-delete-then-reinsert pattern."""
    _get_active_supplier(db, supplier_id)

    for line in lines:
        _validate_material_exists(db, line["raw_material_id"])

    existing = (
        db.query(SupplierMaterial)
        .filter(SupplierMaterial.supplier_id == supplier_id, SupplierMaterial.deleted_at.is_(None))
        .all()
    )
    now = datetime.now(timezone.utc)
    for row in existing:
        row.deleted_at = now

    new_rows = [
        SupplierMaterial(supplier_id=supplier_id, created_by=user_id, **line) for line in lines
    ]
    db.add_all(new_rows)
    db.flush()
    audit_service.log_update(
        db,
        TABLE_NAME,
        supplier_id,
        {"lines": (f"{len(existing)} line(s)", f"{len(new_rows)} line(s)")},
        user_id,
    )
    db.commit()
    return get_materials(db, supplier_id)
