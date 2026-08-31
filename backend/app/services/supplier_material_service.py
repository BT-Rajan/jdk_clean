from sqlalchemy.orm import Session

from app.core.exceptions import ValidationAppError
from app.crud.child_lines import ChildLineCRUD
from app.models.raw_material import RawMaterial
from app.models.supplier import Supplier
from app.models.supplier_material import SupplierMaterial

TABLE_NAME = "supplier_materials"


class SupplierMaterialCRUD(ChildLineCRUD[SupplierMaterial]):
    model = SupplierMaterial
    table_name = TABLE_NAME
    parent_field = "supplier_id"
    parent_model = Supplier
    parent_label = "Supplier"

    def _validate_line(self, db: Session, parent_id: int, line: dict) -> None:
        material = (
            db.query(RawMaterial)
            .filter(RawMaterial.id == line["raw_material_id"], RawMaterial.deleted_at.is_(None))
            .first()
        )
        if material is None:
            raise ValidationAppError(f"Raw material {line['raw_material_id']} not found.")

    def _duplicate_filter(self, parent_id: int, line: dict) -> list:
        return [SupplierMaterial.raw_material_id == line["raw_material_id"]]


supplier_material_crud = SupplierMaterialCRUD()


def get_materials(db: Session, supplier_id: int) -> list[SupplierMaterial]:
    return supplier_material_crud.get_lines(db, supplier_id)


def replace_materials(
    db: Session, supplier_id: int, lines: list[dict], user_id: int | None = None
) -> list[SupplierMaterial]:
    return supplier_material_crud.replace_lines(db, supplier_id, lines, user_id=user_id)
