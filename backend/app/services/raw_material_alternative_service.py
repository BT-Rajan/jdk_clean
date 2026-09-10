from sqlalchemy.orm import Session

from app.core.exceptions import ConflictError, ValidationAppError
from app.crud.child_lines import ChildLineCRUD
from app.models.raw_material import RawMaterial
from app.models.raw_material_alternative import RawMaterialAlternative

TABLE_NAME = "raw_material_alternatives"


class RawMaterialAlternativeCRUD(ChildLineCRUD[RawMaterialAlternative]):
    model = RawMaterialAlternative
    table_name = TABLE_NAME
    parent_field = "raw_material_id"
    parent_model = RawMaterial
    parent_label = "Raw material"

    def _validate_line(self, db: Session, parent_id: int, line: dict) -> None:
        alternative_id = line["alternative_material_id"]
        if alternative_id == parent_id:
            raise ConflictError("A raw material cannot be its own approved alternative.")
        alternative = (
            db.query(RawMaterial)
            .filter(RawMaterial.id == alternative_id, RawMaterial.deleted_at.is_(None))
            .first()
        )
        if alternative is None:
            raise ValidationAppError(f"Raw material {alternative_id} not found.")

    def _duplicate_filter(self, parent_id: int, line: dict) -> list:
        return [RawMaterialAlternative.alternative_material_id == line["alternative_material_id"]]


raw_material_alternative_crud = RawMaterialAlternativeCRUD()


def get_alternatives(db: Session, raw_material_id: int) -> list[RawMaterialAlternative]:
    return raw_material_alternative_crud.get_lines(db, raw_material_id)


def add_alternative(
    db: Session, raw_material_id: int, line: dict, user_id: int | None = None
) -> RawMaterialAlternative:
    return raw_material_alternative_crud.add_line(db, raw_material_id, line, user_id=user_id)


def update_alternative(
    db: Session, raw_material_id: int, alternative_id: int, data: dict, user_id: int | None = None
) -> RawMaterialAlternative:
    return raw_material_alternative_crud.update_line(db, raw_material_id, alternative_id, data, user_id=user_id)


def remove_alternative(
    db: Session, raw_material_id: int, alternative_id: int, user_id: int | None = None
) -> None:
    raw_material_alternative_crud.delete_line(db, raw_material_id, alternative_id, user_id=user_id)
