from sqlalchemy.orm import Session

from app.core.exceptions import ConflictError, ValidationAppError
from app.crud.base import BaseCRUD
from app.models.customer import Customer
from app.models.department import Department
from app.models.machine import Machine
from app.models.product import Product
from app.models.raw_material import RawMaterial
from app.models.supplier import Supplier
from app.models.user import User


class DepartmentCRUD(BaseCRUD):
    model = Department
    table_name = "departments"
    searchable_fields = ["code", "name"]
    sortable_fields = ["code", "name", "created_at"]
    filterable_fields = ["status"]


class UserCRUD(BaseCRUD):
    model = User
    table_name = "users"
    searchable_fields = ["username", "email", "full_name"]
    sortable_fields = ["username", "full_name", "created_at"]
    filterable_fields = ["role", "status", "is_active", "department_id"]

    def _validate_department(self, db: Session, department_id: int | None) -> None:
        if department_id is None:
            return
        exists = (
            db.query(Department)
            .filter(Department.id == department_id, Department.status == "active", Department.deleted_at.is_(None))
            .first()
        )
        if exists is None:
            raise ValidationAppError(f"Department {department_id} is not a recognized, active department.")

    def create(self, db: Session, data: dict, user_id: int | None = None) -> User:
        self._validate_department(db, data.get("department_id"))
        return super().create(db, data, user_id=user_id)

    def update(self, db: Session, id: int, data: dict, user_id: int | None = None) -> User:
        if "department_id" in data:
            self._validate_department(db, data["department_id"])
        return super().update(db, id, data, user_id=user_id)


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
    """Machine == "Production Line" everywhere the UI shows it -- the
    business only ever runs one, so create() below rejects a 2nd record
    outright rather than letting the count silently drift.
    """

    model = Machine
    table_name = "machines"
    searchable_fields = ["name", "code"]
    sortable_fields = ["name", "code", "created_at"]
    filterable_fields = ["status"]

    def create(self, db: Session, data: dict, user_id: int | None = None) -> Machine:
        existing = db.query(Machine).filter(Machine.deleted_at.is_(None)).first()
        if existing is not None:
            raise ConflictError(
                "Only one Production Line is supported. Edit the existing Production Line instead of creating a new one."
            )
        return super().create(db, data, user_id=user_id)


department_crud = DepartmentCRUD()
user_crud = UserCRUD()
customer_crud = CustomerCRUD()
supplier_crud = SupplierCRUD()
raw_material_crud = RawMaterialCRUD()
product_crud = ProductCRUD()
machine_crud = MachineCRUD()
