from datetime import date

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

    def replace_lines(
        self, db: Session, parent_id: int, lines: list[dict], user_id: int | None = None
    ) -> list[SupplierMaterial]:
        """onboarded_at/last_transaction_at are auto-captured, never part
        of the payload (see schemas/supplier_material.py SupplierMaterialIn)
        -- but the base ChildLineCRUD.replace_lines soft-deletes every
        existing line and inserts fresh rows on *every* save, so without
        this override each save would silently reset onboarded_at to
        today and wipe last_transaction_at. Carry both forward from the
        existing line for the same raw_material_id when there is one;
        a genuinely new material gets onboarded_at = today and no
        transaction yet.
        """
        existing_by_material = {
            row.raw_material_id: row for row in self._active_lines_query(db, parent_id).all()
        }
        today = date.today()
        dated_lines = []
        for line in lines:
            existing = existing_by_material.get(line["raw_material_id"])
            dated_lines.append({
                **line,
                "onboarded_at": existing.onboarded_at if existing else today,
                "last_transaction_at": existing.last_transaction_at if existing else None,
            })
        return super().replace_lines(db, parent_id, dated_lines, user_id=user_id)


supplier_material_crud = SupplierMaterialCRUD()


def get_materials(db: Session, supplier_id: int) -> list[SupplierMaterial]:
    return supplier_material_crud.get_lines(db, supplier_id)


def replace_materials(
    db: Session, supplier_id: int, lines: list[dict], user_id: int | None = None
) -> list[SupplierMaterial]:
    return supplier_material_crud.replace_lines(db, supplier_id, lines, user_id=user_id)
