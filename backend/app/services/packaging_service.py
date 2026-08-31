from sqlalchemy.orm import Session

from app.core.exceptions import ValidationAppError
from app.crud.child_lines import ChildLineCRUD
from app.models.product import Product
from app.models.product_packaging import ProductPackagingLine
from app.models.raw_material import RawMaterial

TABLE_NAME = "product_packaging_lines"


class PackagingLineCRUD(ChildLineCRUD[ProductPackagingLine]):
    model = ProductPackagingLine
    table_name = TABLE_NAME
    parent_field = "product_id"
    parent_model = Product
    parent_label = "Product"

    def _validate_line(self, db: Session, parent_id: int, line: dict) -> None:
        material = (
            db.query(RawMaterial)
            .filter(RawMaterial.id == line["packaging_material_id"], RawMaterial.deleted_at.is_(None))
            .first()
        )
        if material is None:
            raise ValidationAppError(f"Packaging material {line['packaging_material_id']} not found.")

    def _duplicate_filter(self, parent_id: int, line: dict) -> list:
        return [ProductPackagingLine.packaging_material_id == line["packaging_material_id"]]

    def _resolve_labels(self, db: Session, lines: list[ProductPackagingLine]) -> None:
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


packaging_line_crud = PackagingLineCRUD()


def get_packaging(db: Session, product_id: int) -> list[ProductPackagingLine]:
    return packaging_line_crud.get_lines(db, product_id)


def replace_packaging(
    db: Session, product_id: int, lines: list[dict], user_id: int | None = None
) -> list[ProductPackagingLine]:
    return packaging_line_crud.replace_lines(db, product_id, lines, user_id=user_id)


def add_packaging_line(
    db: Session, product_id: int, line: dict, user_id: int | None = None
) -> ProductPackagingLine:
    return packaging_line_crud.add_line(db, product_id, line, user_id=user_id)


def delete_packaging_line(db: Session, product_id: int, line_id: int, user_id: int | None = None) -> None:
    packaging_line_crud.delete_line(db, product_id, line_id, user_id=user_id)
