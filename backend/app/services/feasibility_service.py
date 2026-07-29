import json
from datetime import datetime, timezone

from sqlalchemy.orm import Session, joinedload

from app.core.exceptions import ConflictError, NotFoundError, ValidationAppError
from app.core.pagination import sort_and_paginate
from app.models.customer import Customer
from app.models.feasibility import (
    ALLOWED_TRANSITIONS,
    QUOTABLE_STATUSES,
    FeasibilityCheck,
    FeasibilityLine,
)
from app.models.product import Product
from app.models.raw_material import RawMaterial
from app.services import audit_service, bom_service, inventory_service, number_series_service

TABLE_NAME = "feasibility_checks"


def _base_query(db: Session, include_deleted: bool = False):
    query = db.query(FeasibilityCheck).options(
        joinedload(FeasibilityCheck.customer),
        joinedload(FeasibilityCheck.lines).joinedload(FeasibilityLine.product),
    )
    if not include_deleted:
        query = query.filter(FeasibilityCheck.deleted_at.is_(None))
    return query


def get_feasibility(db: Session, feasibility_id: int, include_deleted: bool = False) -> FeasibilityCheck:
    obj = _base_query(db, include_deleted).filter(FeasibilityCheck.id == feasibility_id).first()
    if obj is None:
        raise NotFoundError("Feasibility check")
    return obj


_SORTABLE_FIELDS = {
    "feasibility_number": FeasibilityCheck.feasibility_number,
    "status": FeasibilityCheck.status,
    "created_at": FeasibilityCheck.created_at,
}


def list_feasibility_checks(
    db: Session,
    page: int = 1,
    page_size: int = 25,
    search: str | None = None,
    status: str | None = None,
    customer_id: int | None = None,
    sort: str | None = None,
) -> dict:
    query = _base_query(db)
    if status:
        query = query.filter(FeasibilityCheck.status == status)
    if customer_id:
        query = query.filter(FeasibilityCheck.customer_id == customer_id)
    if search:
        like = f"%{search}%"
        query = query.join(Customer).filter(
            (FeasibilityCheck.feasibility_number.ilike(like)) | (Customer.name.ilike(like))
        )
    return sort_and_paginate(query, FeasibilityCheck, _SORTABLE_FIELDS, sort, page, page_size)


def create_feasibility(db: Session, data: dict, user_id: int | None = None) -> FeasibilityCheck:
    customer = (
        db.query(Customer)
        .filter(Customer.id == data["customer_id"], Customer.deleted_at.is_(None))
        .first()
    )
    if customer is None:
        raise ValidationAppError(f"Customer {data['customer_id']} not found.")

    lines_in = []
    for line in data.pop("lines"):
        product = (
            db.query(Product)
            .filter(Product.id == line["product_id"], Product.deleted_at.is_(None))
            .first()
        )
        if product is None:
            raise ValidationAppError(f"Product {line['product_id']} not found.")
        lines_in.append(line)

    feasibility_number = number_series_service.next_number(db, "FEASIBILITY")
    feasibility = FeasibilityCheck(
        feasibility_number=feasibility_number,
        created_by=user_id,
        **data,
    )
    feasibility.lines = [FeasibilityLine(**line) for line in lines_in]

    db.add(feasibility)
    db.flush()
    audit_service.log_create(db, TABLE_NAME, feasibility.id, user_id)
    db.commit()
    db.refresh(feasibility)
    return get_feasibility(db, feasibility.id)


def run_check(db: Session, feasibility_id: int, user_id: int | None = None) -> FeasibilityCheck:
    """Tries to manufacture every line's product from raw materials
    currently in inventory. All lines covered -> 'feasible'; any shortfall
    on any line -> 'exception_pending', requiring Sales' exception
    approval before a quotation can be raised against this check.
    """
    feasibility = get_feasibility(db, feasibility_id)
    if feasibility.status != "draft":
        raise ConflictError(
            f"Only a draft feasibility check can be run (current status: '{feasibility.status}')."
        )

    all_feasible = True
    for line in feasibility.lines:
        requirements = bom_service.explode_requirements(db, line.product_id, float(line.quantity))
        shortfalls: list[dict] = []
        for raw_material_id, required_qty in requirements.items():
            stock = inventory_service.get_stock(db, "raw_material", raw_material_id)
            available = stock["quantity_available"]
            if available < required_qty:
                material = db.query(RawMaterial).filter(RawMaterial.id == raw_material_id).first()
                shortfalls.append(
                    {
                        "raw_material_id": raw_material_id,
                        "code": material.code if material else f"#{raw_material_id}",
                        "name": material.name if material else "Unknown material",
                        "unit": material.unit if material else "",
                        "required": required_qty,
                        "on_hand": available,
                        "shortfall": round(required_qty - available, 4),
                    }
                )

        line.is_feasible = not shortfalls
        line.shortfall_json = json.dumps(shortfalls) if shortfalls else None
        if shortfalls:
            all_feasible = False

    old_status = feasibility.status
    new_status = "feasible" if all_feasible else "exception_pending"
    feasibility.status = new_status
    feasibility.checked_at = datetime.now(timezone.utc)
    feasibility.updated_by = user_id
    audit_service.log_update(
        db, TABLE_NAME, feasibility_id, {"status": (old_status, new_status)}, user_id
    )
    db.commit()
    return get_feasibility(db, feasibility_id)


def decide_exception(
    db: Session, feasibility_id: int, approve: bool, reason: str, user_id: int | None = None
) -> FeasibilityCheck:
    """Sales' call on a feasibility check that came back short on raw
    materials: approve the exception to let it proceed to quotation
    despite the shortfall, or reject it (which still requires a separate
    close_reason via close_feasibility to actually terminate it, keeping
    'why we didn't proceed' explicit at both steps).
    """
    feasibility = get_feasibility(db, feasibility_id)
    if feasibility.status != "exception_pending":
        raise ConflictError(
            f"No exception is pending on this feasibility check (current status: "
            f"'{feasibility.status}')."
        )

    new_status = "exception_approved" if approve else "exception_rejected"
    old_status = feasibility.status
    feasibility.status = new_status
    feasibility.exception_reason = reason
    feasibility.exception_by = user_id
    feasibility.updated_by = user_id
    audit_service.log_update(
        db, TABLE_NAME, feasibility_id, {"status": (old_status, new_status)}, user_id
    )
    db.commit()
    return get_feasibility(db, feasibility_id)


def close_feasibility(db: Session, feasibility_id: int, reason: str, user_id: int | None = None) -> FeasibilityCheck:
    """Sales closing a feasible/exception-approved/exception-rejected check
    without ever generating a quotation from it. A reason is mandatory."""
    feasibility = get_feasibility(db, feasibility_id)
    allowed = ALLOWED_TRANSITIONS.get(feasibility.status, set())
    if "closed" not in allowed:
        raise ConflictError(
            f"Cannot close a feasibility check from status '{feasibility.status}'."
        )
    if not reason or not reason.strip():
        raise ValidationAppError("A reason is required to close a feasibility check.")

    old_status = feasibility.status
    feasibility.status = "closed"
    feasibility.close_reason = reason
    feasibility.updated_by = user_id
    audit_service.log_update(
        db, TABLE_NAME, feasibility_id, {"status": (old_status, "closed")}, user_id
    )
    db.commit()
    return get_feasibility(db, feasibility_id)


def list_available_for_quotation(db: Session, customer_id: int | None = None) -> list[FeasibilityCheck]:
    """List feasibility checks available for quotation generation.
    Only returns checks in quotable statuses (feasible, exception_approved)
    that haven't been converted or closed."""
    query = _base_query(db).filter(FeasibilityCheck.status.in_(QUOTABLE_STATUSES))
    if customer_id:
        query = query.filter(FeasibilityCheck.customer_id == customer_id)
    return query.order_by(FeasibilityCheck.feasibility_number.desc()).all()


def mark_converted(db: Session, feasibility_id: int, user_id: int | None = None) -> None:
    """Called by quotation_service.create_quotation once it has validated
    this feasibility check is quotable; not exposed as its own endpoint."""
    feasibility = get_feasibility(db, feasibility_id)
    if feasibility.status not in QUOTABLE_STATUSES:
        raise ConflictError(
            f"Feasibility check '{feasibility.feasibility_number}' is not in a quotable status "
            f"(current status: '{feasibility.status}')."
        )
    old_status = feasibility.status
    feasibility.status = "converted"
    feasibility.updated_by = user_id
    audit_service.log_update(
        db, TABLE_NAME, feasibility_id, {"status": (old_status, "converted")}, user_id
    )


def delete_feasibility(db: Session, feasibility_id: int, user_id: int | None = None) -> None:
    feasibility = get_feasibility(db, feasibility_id)
    if feasibility.status == "converted":
        raise ConflictError("This feasibility check has been converted to a quotation and cannot be deleted.")
    feasibility.deleted_at = datetime.now(timezone.utc)
    audit_service.log_delete(db, TABLE_NAME, feasibility_id, user_id)
    db.commit()


def restore_feasibility(db: Session, feasibility_id: int, user_id: int | None = None) -> FeasibilityCheck:
    feasibility = get_feasibility(db, feasibility_id, include_deleted=True)
    feasibility.deleted_at = None
    audit_service.log_restore(db, TABLE_NAME, feasibility_id, user_id)
    db.commit()
    return get_feasibility(db, feasibility_id)
