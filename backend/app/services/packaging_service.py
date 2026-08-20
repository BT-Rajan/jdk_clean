from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.core.exceptions import ConflictError, NotFoundError, ValidationAppError
from app.models.product import Product
from app.models.product_packaging import ProductPackagingLine
from app.models.raw_material import RawMaterial
from app.services import audit_service

TABLE_NAME = "product_packaging_lines"


def _get_active_product(db: Session, product_id: int) -> Product:
    product = (
        db.query(Product).filter(Product.id == product_id, Product.deleted_at.is_(None)).first()
    )
    if product is None:
        raise NotFoundError("Product")
    return product


def _validate_material_exists(db: Session, packaging_material_id: int) -> None:
    obj = (
        db.query(RawMaterial)
        .filter(RawMaterial.id == packaging_material_id, RawMaterial.deleted_at.is_(None))
        .first()
    )
    if obj is None:
        raise ValidationAppError(f"Packaging material {packaging_material_id} not found.")


def _resolve_material_labels(db: Session, lines: list[ProductPackagingLine]) -> None:
    material_ids = {l.packaging_material_id for l in lines}
    materials = (
        {m.id: m for m in db.query(RawMaterial).filter(RawMaterial.id.in_(material_ids)).all()}
        if material_ids
        else {}
    )
    for line in lines:
        material = materials.get(line.packaging_material_id)
        line.packaging_material_code = material.code if material else None
        line.packaging_material_name = material.name if material else None


def get_packaging(db: Session, product_id: int) -> list[ProductPackagingLine]:
    _get_active_product(db, product_id)
    lines = (
        db.query(ProductPackagingLine)
        .filter(ProductPackagingLine.product_id == product_id, ProductPackagingLine.deleted_at.is_(None))
        .order_by(ProductPackagingLine.id)
        .all()
    )
    _resolve_material_labels(db, lines)
    return lines


def replace_packaging(
    db: Session, product_id: int, lines: list[dict], user_id: int | None = None
) -> list[ProductPackagingLine]:
    """Replaces the entire active packaging list for a product with the
    given lines. Mirrors bom_service.replace_bom."""
    _get_active_product(db, product_id)

    for line in lines:
        _validate_material_exists(db, line["packaging_material_id"])

    existing = (
        db.query(ProductPackagingLine)
        .filter(ProductPackagingLine.product_id == product_id, ProductPackagingLine.deleted_at.is_(None))
        .all()
    )
    now = datetime.now(timezone.utc)
    for row in existing:
        row.deleted_at = now

    new_rows = [
        ProductPackagingLine(product_id=product_id, created_by=user_id, **line) for line in lines
    ]
    db.add_all(new_rows)
    db.flush()
    audit_service.log_update(
        db,
        TABLE_NAME,
        product_id,
        {"lines": (f"{len(existing)} line(s)", f"{len(new_rows)} line(s)")},
        user_id,
    )
    db.commit()
    return get_packaging(db, product_id)


def add_packaging_line(
    db: Session, product_id: int, line: dict, user_id: int | None = None
) -> ProductPackagingLine:
    _get_active_product(db, product_id)
    _validate_material_exists(db, line["packaging_material_id"])

    duplicate = (
        db.query(ProductPackagingLine)
        .filter(
            ProductPackagingLine.product_id == product_id,
            ProductPackagingLine.packaging_material_id == line["packaging_material_id"],
            ProductPackagingLine.deleted_at.is_(None),
        )
        .first()
    )
    if duplicate is not None:
        raise ConflictError("This packaging material is already listed; edit that line instead.")

    row = ProductPackagingLine(product_id=product_id, created_by=user_id, **line)
    db.add(row)
    db.flush()
    # Keyed by product_id (not row.id), matching bom_service's convention --
    # history is queried per-product, not per-line.
    audit_service.log_create(db, TABLE_NAME, product_id, user_id)
    db.commit()
    _resolve_material_labels(db, [row])
    return row


def delete_packaging_line(db: Session, product_id: int, line_id: int, user_id: int | None = None) -> None:
    row = (
        db.query(ProductPackagingLine)
        .filter(
            ProductPackagingLine.id == line_id,
            ProductPackagingLine.product_id == product_id,
            ProductPackagingLine.deleted_at.is_(None),
        )
        .first()
    )
    if row is None:
        raise NotFoundError("Packaging line")
    row.deleted_at = datetime.now(timezone.utc)
    audit_service.log_delete(db, TABLE_NAME, product_id, user_id)
    db.commit()
