import re

from sqlalchemy.orm import Session, selectinload

from app.core.exceptions import ConflictError, ValidationAppError
from app.core.permissions import is_team_member
from app.crud.base import BaseCRUD
from app.models.customer import Customer
from app.models.department import Department
from app.models.machine import Machine
from app.models.product import Product
from app.models.qc_agent import QcAgent
from app.models.raw_material import RawMaterial
from app.models.supplier import Supplier
from app.models.user import User
from app.services import number_series_service


def _normalize_phone(phone: str) -> str:
    """Digits only, so '+965 1234 5678', '965-1234-5678', and
    '96512345678' all compare equal -- see _check_duplicate_phone below.
    """
    return re.sub(r"\D", "", phone)


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

    def _validate_role_department(
        self, db: Session, role: str, department_id: int | None, exclude_user_id: int | None = None
    ) -> None:
        """department_head/team_member both require a department (spec
        section 10: "Department Head + no department must not be
        allowed", same for Team Member) -- admin/viewer/legacy manager
        are unrestricted here, same as before this pass. Also enforces
        one active department_head per department (section 11): the
        business hasn't shown a need for more than one, and nothing in
        the existing schema suggests otherwise, so this stays a hard
        rule rather than configurable -- revisit only if that changes.
        """
        if role in ("department_head", "team_member") and department_id is None:
            raise ValidationAppError(
                f"A {role.replace('_', ' ')} must have a department."
            )
        if role != "department_head" or department_id is None:
            return
        existing_head = db.query(User).filter(
            User.department_id == department_id,
            User.role == "department_head",
            User.is_active.is_(True),
            User.deleted_at.is_(None),
        )
        if exclude_user_id is not None:
            existing_head = existing_head.filter(User.id != exclude_user_id)
        if existing_head.first() is not None:
            raise ConflictError("This department already has an active department head. Reassign or deactivate them first.")

    def create(self, db: Session, data: dict, user_id: int | None = None) -> User:
        self._validate_department(db, data.get("department_id"))
        self._validate_role_department(db, data.get("role", "staff"), data.get("department_id"))
        return super().create(db, data, user_id=user_id)

    def update(self, db: Session, id: int, data: dict, user_id: int | None = None) -> User:
        if "department_id" in data:
            self._validate_department(db, data["department_id"])
        if "role" in data or "department_id" in data:
            existing = self.read_one(db, id)
            role = data.get("role", existing.role)
            department_id = data.get("department_id", existing.department_id)
            self._validate_role_department(db, role, department_id, exclude_user_id=id)
        return super().update(db, id, data, user_id=user_id)


class CustomerCRUD(BaseCRUD):
    model = Customer
    table_name = "customers"
    searchable_fields = ["name", "code", "customer_number", "email", "contact_person", "phone", "reference"]
    sortable_fields = ["name", "code", "customer_number", "created_at"]
    filterable_fields = ["status", "city", "country", "category", "assigned_to"]

    def _base_query(self, db: Session, include_deleted: bool = False):
        # One extra query per page for the owners' names (assigned_to_name)
        # instead of one per row -- and no join, see Customer.assignee.
        return super()._base_query(db, include_deleted).options(
            selectinload(Customer.assignee), selectinload(Customer.buyer), selectinload(Customer.followup_responsible)
        )

    def _scope_query(self, query, user: User | None = None):
        """Ownership scoping for team_member: assigned_to = them, nothing
        else. created_by is deliberately NOT part of it -- once the Sales
        Manager reassigns a customer the previous salesman loses access
        (Sales spec section 2); a salesman's own new customers stay theirs
        because create() auto-assigns them to their creator. Every other
        role (admin, department_head, viewer, and any not-yet-migrated
        legacy 'manager') sees whatever the page-level check already
        allowed -- unfiltered here, see app/core/permissions.py's module
        docstring. `user=None` (the BaseCRUD default) means "no scoping",
        used by internal callers that already know they're allowed the
        record."""
        if user is None or not is_team_member(user):
            return query
        return query.filter(Customer.assigned_to == user.id)

    def _check_duplicate_phone(self, db: Session, phone: str | None, exclude_id: int | None = None) -> None:
        if not phone:
            return
        normalized = _normalize_phone(phone)
        if not normalized:
            return
        query = db.query(Customer).filter(Customer.deleted_at.is_(None), Customer.phone.isnot(None))
        if exclude_id is not None:
            query = query.filter(Customer.id != exclude_id)
        for existing in query.all():
            if _normalize_phone(existing.phone) == normalized:
                raise ConflictError(
                    f"A customer with this phone number already exists: {existing.name} ({existing.customer_number})."
                )

    def _check_duplicate_email(self, db: Session, email: str | None, exclude_id: int | None = None) -> None:
        # Same shape as _check_duplicate_phone above -- exact match
        # (case-insensitive) on the primary email only, not
        # alternate_email: that's a backup contact, not a second
        # identifier worth deduplicating on.
        if not email:
            return
        normalized = email.strip().lower()
        query = db.query(Customer).filter(Customer.deleted_at.is_(None), Customer.email.isnot(None))
        if exclude_id is not None:
            query = query.filter(Customer.id != exclude_id)
        for existing in query.all():
            if existing.email.strip().lower() == normalized:
                raise ConflictError(
                    f"A customer with this email already exists: {existing.name} ({existing.customer_number})."
                )

    def _validate_parent_company(self, db: Session, parent_company_id: int | None, exclude_id: int | None = None) -> None:
        if parent_company_id is None:
            return
        if exclude_id is not None and parent_company_id == exclude_id:
            raise ValidationAppError("A customer cannot be its own parent company.")
        exists = (
            db.query(Customer.id)
            .filter(Customer.id == parent_company_id, Customer.deleted_at.is_(None))
            .first()
        )
        if exists is None:
            raise ValidationAppError(f"Customer {parent_company_id} is not a recognized customer.")

    def _validate_user_ref(self, db: Session, user_id: int | None, label: str) -> None:
        # Same "must exist, must be active" check api/customers.py's
        # assign_customer already applies to assigned_to -- reused here
        # for buyer_id/followup_responsible_id.
        if user_id is None:
            return
        exists = (
            db.query(User.id)
            .filter(User.id == user_id, User.deleted_at.is_(None), User.is_active.is_(True))
            .first()
        )
        if exists is None:
            raise ValidationAppError(f"{label} {user_id} is not an active user.")

    def _check_credit_terms(self, data: dict, existing: Customer | None) -> None:
        # CustomerCreate's model_validator does this same check where
        # both fields are always present in the payload; this covers
        # CustomerUpdate, which commonly sends just one of the two (see
        # schemas/customer.py CustomerUpdate's docstring) -- falls back
        # to the existing row for whichever field the payload omits.
        terms_type = data.get("payment_terms_type", getattr(existing, "payment_terms_type", "credit") if existing else "credit")
        if terms_type != "credit":
            return
        days = data.get("payment_terms_days", getattr(existing, "payment_terms_days", 0) if existing else 0)
        if not days or int(days) <= 0:
            raise ValidationAppError("Credit days is required (must be greater than 0) when payment terms is Credit.")

    def create(self, db: Session, data: dict, user_id: int | None = None) -> Customer:
        self._check_duplicate_phone(db, data.get("phone"))
        self._check_duplicate_email(db, data.get("email"))
        self._check_credit_terms(data, None)
        self._validate_parent_company(db, data.get("parent_company_id"))
        self._validate_user_ref(db, data.get("buyer_id"), "Buyer")
        self._validate_user_ref(db, data.get("followup_responsible_id"), "Follow-up responsible")
        # customer_number is an internal reference, auto-generated the
        # same way order_number/quotation_number/etc. are -- never
        # client-supplied (see schemas/customer.py CustomerCreate, which
        # has no such field at all).
        data = {**data, "customer_number": number_series_service.next_number(db, "CUSTOMER")}
        # A salesman's own new customer is theirs: ownership is assigned_to
        # only (see _scope_query), so without this it would vanish from
        # their own list the moment it was created. A Sales Manager/admin
        # creating one leaves it unassigned for the manager to hand out.
        if user_id is not None and data.get("assigned_to") is None:
            creator = db.get(User, user_id)
            if creator is not None and is_team_member(creator):
                data = {**data, "assigned_to": user_id}
        return super().create(db, data, user_id=user_id)

    def update(self, db: Session, id: int, data: dict, user_id: int | None = None) -> Customer:
        if "phone" in data:
            self._check_duplicate_phone(db, data["phone"], exclude_id=id)
        if "email" in data:
            self._check_duplicate_email(db, data["email"], exclude_id=id)
        if "payment_terms_type" in data or "payment_terms_days" in data:
            existing = self.read_one(db, id)
            self._check_credit_terms(data, existing)
        if "parent_company_id" in data:
            self._validate_parent_company(db, data["parent_company_id"], exclude_id=id)
        if "buyer_id" in data:
            self._validate_user_ref(db, data["buyer_id"], "Buyer")
        if "followup_responsible_id" in data:
            self._validate_user_ref(db, data["followup_responsible_id"], "Follow-up responsible")
        if data.get("code") is not None:
            # code (civil ID / registration number) is one-directional:
            # settable only while still NULL (a prospective customer
            # providing it for the first time), never changed once set --
            # same lock CustomerUpdate's docstring documents for `name`.
            existing = db.query(Customer.code).filter(Customer.id == id).scalar()
            if existing is not None:
                raise ValidationAppError("This customer's ID/registration number is already on file and can't be changed.")
        return super().update(db, id, data, user_id=user_id)


class SupplierCRUD(BaseCRUD):
    model = Supplier
    table_name = "suppliers"
    searchable_fields = ["name", "code", "email"]
    sortable_fields = ["name", "code", "rating", "created_at"]
    filterable_fields = ["status", "city", "country", "mode_of_supply"]

    def _check_duplicate_phone(self, db: Session, phone: str | None, exclude_id: int | None = None) -> None:
        if not phone:
            return
        normalized = _normalize_phone(phone)
        if not normalized:
            return
        query = db.query(Supplier).filter(Supplier.deleted_at.is_(None), Supplier.phone.isnot(None))
        if exclude_id is not None:
            query = query.filter(Supplier.id != exclude_id)
        for existing in query.all():
            if _normalize_phone(existing.phone) == normalized:
                raise ConflictError(
                    f"A supplier with this phone number already exists: {existing.name} ({existing.code})."
                )

    def create(self, db: Session, data: dict, user_id: int | None = None) -> Supplier:
        self._check_duplicate_phone(db, data.get("phone"))
        # code is auto-generated the same way order_number/quotation_number
        # /etc. are -- never client-supplied (see schemas/supplier.py
        # SupplierCreate, which has no such field at all).
        data = {**data, "code": number_series_service.next_number(db, "SUPPLIER")}
        return super().create(db, data, user_id=user_id)

    def update(self, db: Session, id: int, data: dict, user_id: int | None = None) -> Supplier:
        if "phone" in data:
            self._check_duplicate_phone(db, data["phone"], exclude_id=id)
        return super().update(db, id, data, user_id=user_id)


class RawMaterialCRUD(BaseCRUD):
    model = RawMaterial
    table_name = "raw_materials"
    searchable_fields = ["name", "code"]
    sortable_fields = ["name", "code", "created_at"]
    filterable_fields = ["status", "material_type", "category"]

    def _check_stock_thresholds(self, data: dict, existing: RawMaterial | None) -> None:
        # RawMaterialUpdate only cross-checks fields present in the same
        # payload (see its docstring) -- a payload that only raises
        # maximum_stock, or only lowers safety_stock, needs the *existing*
        # row's other values to actually validate against, which only
        # this layer (with `existing` in hand) can do.
        maximum_stock = data.get("maximum_stock", getattr(existing, "maximum_stock", 0) if existing else 0)
        if not maximum_stock or float(maximum_stock) <= 0:
            return
        safety_stock = data.get("safety_stock", getattr(existing, "safety_stock", 0) if existing else 0)
        reorder_point = data.get("reorder_point", getattr(existing, "reorder_point", 0) if existing else 0)
        if safety_stock is not None and float(safety_stock) > float(maximum_stock):
            raise ValidationAppError("Safety stock cannot exceed maximum stock.")
        if reorder_point is not None and float(reorder_point) > float(maximum_stock):
            raise ValidationAppError("Reorder point cannot exceed maximum stock.")

    def create(self, db: Session, data: dict, user_id: int | None = None) -> RawMaterial:
        self._check_stock_thresholds(data, None)
        return super().create(db, data, user_id=user_id)

    def update(self, db: Session, id: int, data: dict, user_id: int | None = None) -> RawMaterial:
        existing = self.read_one(db, id)
        self._check_stock_thresholds(data, existing)
        return super().update(db, id, data, user_id=user_id)


class ProductCRUD(BaseCRUD):
    model = Product
    table_name = "products"
    searchable_fields = ["name", "code"]
    sortable_fields = ["name", "code", "created_at"]
    filterable_fields = ["status", "product_type", "category"]

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

    def _check_stock_thresholds(self, data: dict, existing: Product | None) -> None:
        # Same "fill the gaps from the existing row" reasoning as
        # RawMaterialCRUD's identical method -- a payload that only
        # lowers reorder_point still needs the *existing* maximum_stock
        # to validate against.
        maximum_stock = data.get("maximum_stock", getattr(existing, "maximum_stock", 0) if existing else 0)
        if not maximum_stock or float(maximum_stock) <= 0:
            return
        reorder_point = data.get("reorder_point", getattr(existing, "reorder_point", 0) if existing else 0)
        if reorder_point is not None and float(reorder_point) > float(maximum_stock):
            raise ValidationAppError("Reorder point cannot exceed maximum stock.")

    def create(self, db: Session, data: dict, user_id: int | None = None) -> Product:
        self._check_stock_thresholds(data, None)
        return super().create(db, self._sync_hours_per_unit(data), user_id=user_id)

    def update(self, db: Session, id: int, data: dict, user_id: int | None = None) -> Product:
        existing = self.read_one(db, id)
        self._check_stock_thresholds(data, existing)
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


class QcAgentCRUD(BaseCRUD):
    """External testing laboratory/agent (P7) -- see app/models/qc_agent.py
    for why this is its own minimal master rather than reusing Supplier."""

    model = QcAgent
    table_name = "qc_agents"
    searchable_fields = ["name", "code"]
    sortable_fields = ["name", "code", "created_at"]
    filterable_fields = ["status"]


department_crud = DepartmentCRUD()
user_crud = UserCRUD()
customer_crud = CustomerCRUD()
supplier_crud = SupplierCRUD()
raw_material_crud = RawMaterialCRUD()
product_crud = ProductCRUD()
machine_crud = MachineCRUD()
qc_agent_crud = QcAgentCRUD()
