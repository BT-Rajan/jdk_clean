from sqlalchemy.orm import Session

from app.core.exceptions import ValidationAppError
from app.crud.base import BaseCRUD
from app.models.customer import Customer
from app.models.machine import Machine
from app.models.product import Product
from app.models.raw_material import RawMaterial
from app.models.supplier import Supplier
from app.models.unit_of_measure import UnitOfMeasure
from app.models.user import User


class UserCRUD(BaseCRUD):
    model = User
    table_name = "users"
    searchable_fields = ["username", "email", "full_name"]
    sortable_fields = ["username", "full_name", "created_at"]
    filterable_fields = ["role", "status", "is_active"]


class CustomerCRUD(BaseCRUD):
    model = Customer
    table_name = "customers"
    searchable_fields = ["name", "code", "email"]
    sortable_fields = ["name", "code", "created_at"]
    filterable_fields = ["status", "city", "country"]


class SupplierCRUD(BaseCRUD):
    model = Supplier
    table_name = "suppliers"
    searchable_fields = ["name", "code", "email"]
    sortable_fields = ["name", "code", "rating", "created_at"]
    filterable_fields = ["status", "city", "country", "mode_of_supply"]


class RawMaterialCRUD(BaseCRUD):
    model = RawMaterial
    table_name = "raw_materials"
    searchable_fields = ["name", "code"]
    sortable_fields = ["name", "code", "created_at"]
    filterable_fields = ["status"]

    def _validate_unit(self, db: Session, unit: str | None) -> None:
        """New/updated materials must use a code from units_of_measure --
        this is what turns the plain `unit` string into a de-facto
        dropdown and is what lets bom_service convert a BOM line's unit
        into this material's unit precisely instead of assuming they
        already match. Existing rows written before this table existed
        keep whatever free text they have; they're not retroactively
        rejected, just treated as unconvertible (factor 1) at calc time
        -- see bom_service.explode_requirements.
        """
        if unit is None:
            return
        exists = (
            db.query(UnitOfMeasure)
            .filter(UnitOfMeasure.code == unit, UnitOfMeasure.status == "active", UnitOfMeasure.deleted_at.is_(None))
            .first()
        )
        if exists is None:
            raise ValidationAppError(
                f"'{unit}' is not a recognized unit. Add it under Settings -> Units of measure first, "
                "or pick an existing one."
            )

    def create(self, db: Session, data: dict, user_id: int | None = None) -> RawMaterial:
        self._validate_unit(db, data.get("unit"))
        return super().create(db, data, user_id=user_id)

    def update(self, db: Session, id: int, data: dict, user_id: int | None = None) -> RawMaterial:
        self._validate_unit(db, data.get("unit"))
        return super().update(db, id, data, user_id=user_id)


class ProductCRUD(BaseCRUD):
    model = Product
    table_name = "products"
    searchable_fields = ["name", "code"]
    sortable_fields = ["name", "code", "created_at"]
    filterable_fields = ["status", "product_type"]

    def _sync_hours_per_unit(self, data: dict, existing: Product | None = None) -> dict:
        """batch_size + batch_production_hours are how the form captures
        production time ("one batch of 500 takes 6 hours"), but every
        capacity calculation downstream (feasibility_service.
        _check_capacity, capacity_service, order_service's auto-schedule)
        is written in terms of hours per single unit. Whenever a save
        provides (or already has, for an update, one alone) both batch
        figures, derive production_hours_per_unit from them so those two
        numbers are always the actual source of truth once set, and admin
        never has to compute the division themselves or keep the two
        views in sync by hand.
        """
        batch_size = data.get("batch_size", getattr(existing, "batch_size", None) if existing else None)
        batch_hours = data.get(
            "batch_production_hours", getattr(existing, "batch_production_hours", None) if existing else None
        )
        if batch_size and batch_hours is not None and float(batch_size) > 0:
            data = {**data, "production_hours_per_unit": round(float(batch_hours) / float(batch_size), 4)}
        return data

    def create(self, db: Session, data: dict, user_id: int | None = None) -> Product:
        return super().create(db, self._sync_hours_per_unit(data), user_id=user_id)

    def update(self, db: Session, id: int, data: dict, user_id: int | None = None) -> Product:
        existing = self.read_one(db, id)
        return super().update(db, id, self._sync_hours_per_unit(data, existing), user_id=user_id)


class MachineCRUD(BaseCRUD):
    model = Machine
    table_name = "machines"
    searchable_fields = ["name", "code"]
    sortable_fields = ["name", "code", "created_at"]
    filterable_fields = ["status"]


class UnitOfMeasureCRUD(BaseCRUD):
    model = UnitOfMeasure
    table_name = "units_of_measure"
    searchable_fields = ["code", "name"]
    sortable_fields = ["code", "name", "category", "created_at"]
    filterable_fields = ["status", "category"]

    def _validate_single_base(self, db: Session, category: str, is_base: bool, exclude_id: int | None) -> None:
        if not is_base:
            return
        query = db.query(UnitOfMeasure).filter(
            UnitOfMeasure.category == category,
            UnitOfMeasure.is_base.is_(True),
            UnitOfMeasure.deleted_at.is_(None),
        )
        if exclude_id is not None:
            query = query.filter(UnitOfMeasure.id != exclude_id)
        if query.first() is not None:
            raise ValidationAppError(
                f"'{category}' already has a base unit. Unset it there first, or leave this one non-base."
            )

    def create(self, db: Session, data: dict, user_id: int | None = None) -> UnitOfMeasure:
        self._validate_single_base(db, data.get("category"), bool(data.get("is_base")), exclude_id=None)
        return super().create(db, data, user_id=user_id)

    def update(self, db: Session, id: int, data: dict, user_id: int | None = None) -> UnitOfMeasure:
        existing = self.read_one(db, id)
        is_base = data.get("is_base", existing.is_base)
        self._validate_single_base(db, existing.category, bool(is_base), exclude_id=id)
        return super().update(db, id, data, user_id=user_id)


user_crud = UserCRUD()
customer_crud = CustomerCRUD()
supplier_crud = SupplierCRUD()
raw_material_crud = RawMaterialCRUD()
product_crud = ProductCRUD()
machine_crud = MachineCRUD()
unit_of_measure_crud = UnitOfMeasureCRUD()
