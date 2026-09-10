from datetime import date

from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError, ValidationAppError
from app.crud.child_lines import ChildLineCRUD
from app.models.raw_material import RawMaterial
from app.models.supplier import Supplier
from app.models.supplier_material import SupplierMaterial

TABLE_NAME = "supplier_materials"


def _with_onboarded_at(line: dict) -> dict:
    """add_line has no equivalent of replace_lines' carry-forward
    override (there's no existing row to carry anything forward from --
    this is always a brand new line), so onboarded_at is simply today
    whenever it isn't already supplied. See SupplierMaterialCRUD.
    replace_lines below for why this column is never client-supplied."""
    return {**line, "onboarded_at": line.get("onboarded_at", date.today())}


def _enforce_single_preferred(db: Session, raw_material_id: int, keep_id: int | None) -> None:
    """At most one active supplier is "preferred" per raw material.
    Whenever a line is saved as preferred, every other active line for
    the same material (any supplier) is unset -- silently, the same way
    e.g. a single-default-address pattern would, rather than rejecting
    the save: the user's clear intent in checking "preferred" here is
    for *this* one to be it.
    """
    others = (
        db.query(SupplierMaterial)
        .filter(
            SupplierMaterial.raw_material_id == raw_material_id,
            SupplierMaterial.deleted_at.is_(None),
            SupplierMaterial.is_preferred.is_(True),
        )
    )
    if keep_id is not None:
        others = others.filter(SupplierMaterial.id != keep_id)
    for row in others.all():
        row.is_preferred = False


def _check_moq(moq: float | None, max_supply_quantity: float | None) -> None:
    if moq and max_supply_quantity and moq > max_supply_quantity:
        raise ValidationAppError("MOQ cannot exceed the maximum supply quantity.")


class SupplierMaterialCRUD(ChildLineCRUD[SupplierMaterial]):
    """Owned from the supplier's side: a supplier's full list of
    suppliable materials, edited as a unit (PUT .../suppliers/{id}/materials).
    See MaterialSupplierCRUD below for the material-owned mirror image."""

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
        _check_moq(line.get("moq"), line.get("max_supply_quantity"))

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
        result = super().replace_lines(db, parent_id, dated_lines, user_id=user_id)
        for row in result:
            if row.is_preferred:
                _enforce_single_preferred(db, row.raw_material_id, keep_id=row.id)
        if any(row.is_preferred for row in result):
            db.commit()
        return result


class MaterialSupplierCRUD(ChildLineCRUD[SupplierMaterial]):
    """Owned from the raw material's side: which suppliers can provide
    *this* material, edited one line at a time from the material's
    Procurement/Suppliers panel -- the mirror image of
    SupplierMaterialCRUD above, same underlying table.

    Only single-line operations (get/add/update/delete) are used from
    this side; there's no material-owned "replace the whole list" --
    unlike a supplier's material list (fully re-authored from an
    onboarding wizard), a material's supplier list is built up
    incrementally as new suppliers are qualified for it.
    """

    model = SupplierMaterial
    table_name = TABLE_NAME
    parent_field = "raw_material_id"
    parent_model = RawMaterial
    parent_label = "Raw material"

    def _validate_line(self, db: Session, parent_id: int, line: dict) -> None:
        supplier = (
            db.query(Supplier)
            .filter(Supplier.id == line["supplier_id"], Supplier.deleted_at.is_(None))
            .first()
        )
        if supplier is None:
            raise ValidationAppError(f"Supplier {line['supplier_id']} not found.")
        _check_moq(line.get("moq"), line.get("max_supply_quantity"))

    def _duplicate_filter(self, parent_id: int, line: dict) -> list:
        return [SupplierMaterial.supplier_id == line["supplier_id"]]

    def add_line(self, db: Session, parent_id: int, line: dict, user_id: int | None = None) -> SupplierMaterial:
        row = super().add_line(db, parent_id, _with_onboarded_at(line), user_id=user_id)
        if row.is_preferred:
            _enforce_single_preferred(db, row.raw_material_id, keep_id=row.id)
            db.commit()
        return row


supplier_material_crud = SupplierMaterialCRUD()
material_supplier_crud = MaterialSupplierCRUD()


def get_materials(db: Session, supplier_id: int) -> list[SupplierMaterial]:
    return supplier_material_crud.get_lines(db, supplier_id)


def replace_materials(
    db: Session, supplier_id: int, lines: list[dict], user_id: int | None = None
) -> list[SupplierMaterial]:
    return supplier_material_crud.replace_lines(db, supplier_id, lines, user_id=user_id)


def get_suppliers_for_material(db: Session, raw_material_id: int) -> list[SupplierMaterial]:
    return material_supplier_crud.get_lines(db, raw_material_id)


def add_supplier_for_material(
    db: Session, raw_material_id: int, line: dict, user_id: int | None = None
) -> SupplierMaterial:
    return material_supplier_crud.add_line(db, raw_material_id, line, user_id=user_id)


def _get_active_line(db: Session, raw_material_id: int, line_id: int) -> SupplierMaterial:
    row = (
        db.query(SupplierMaterial)
        .filter(
            SupplierMaterial.id == line_id,
            SupplierMaterial.raw_material_id == raw_material_id,
            SupplierMaterial.deleted_at.is_(None),
        )
        .first()
    )
    if row is None:
        raise NotFoundError("Supplier material line")
    return row


def update_supplier_material_line(
    db: Session, raw_material_id: int, line_id: int, data: dict, user_id: int | None = None
) -> SupplierMaterial:
    existing = _get_active_line(db, raw_material_id, line_id)
    moq = data.get("moq", existing.moq)
    max_supply_quantity = data.get("max_supply_quantity", existing.max_supply_quantity)
    _check_moq(float(moq) if moq is not None else None, float(max_supply_quantity) if max_supply_quantity is not None else None)

    row = material_supplier_crud.update_line(db, raw_material_id, line_id, data, user_id=user_id)
    if data.get("is_preferred"):
        _enforce_single_preferred(db, raw_material_id, keep_id=row.id)
        db.commit()
    return row


def remove_supplier_material_line(
    db: Session, raw_material_id: int, line_id: int, user_id: int | None = None
) -> None:
    material_supplier_crud.delete_line(db, raw_material_id, line_id, user_id=user_id)
