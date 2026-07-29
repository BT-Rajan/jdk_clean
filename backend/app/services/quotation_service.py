from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session, joinedload

from app.core.exceptions import ConflictError, NotFoundError, ValidationAppError
from app.core.pagination import sort_and_paginate
from app.models.customer import Customer
from app.models.product import Product
from app.models.quotation import (
    ALLOWED_TRANSITIONS,
    STATUSES_REQUIRING_CLOSE_REASON,
    Quotation,
    QuotationDetail,
)
from app.services import audit_service, feasibility_service, number_series_service

TABLE_NAME = "quotations"


def _price_lines(db: Session, lines: list[dict]) -> list[dict]:
    """Validate referenced products exist and compute each line's total."""
    priced: list[dict] = []
    for line in lines:
        product = (
            db.query(Product)
            .filter(Product.id == line["product_id"], Product.deleted_at.is_(None))
            .first()
        )
        if product is None:
            raise ValidationAppError(f"Product {line['product_id']} not found.")
        line_total = round(float(line["quantity"]) * float(line["unit_price"]), 2)
        priced.append({**line, "line_total": line_total})
    return priced


def _base_query(db: Session, include_deleted: bool = False):
    query = db.query(Quotation).options(
        joinedload(Quotation.customer),
        joinedload(Quotation.lines).joinedload(QuotationDetail.product),
    )
    if not include_deleted:
        query = query.filter(Quotation.deleted_at.is_(None))
    return query


def get_quotation(db: Session, quotation_id: int, include_deleted: bool = False) -> Quotation:
    obj = _base_query(db, include_deleted).filter(Quotation.id == quotation_id).first()
    if obj is None:
        raise NotFoundError("Quotation")
    return obj


_QUOTATION_SORTABLE_FIELDS = {
    "quotation_number": Quotation.quotation_number,
    "quotation_date": Quotation.quotation_date,
    "total_amount": Quotation.total_amount,
    "status": Quotation.status,
    "created_at": Quotation.created_at,
}


def list_quotations(
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
        query = query.filter(Quotation.status == status)
    if customer_id:
        query = query.filter(Quotation.customer_id == customer_id)
    if search:
        like = f"%{search}%"
        query = query.join(Customer).filter(
            (Quotation.quotation_number.ilike(like)) | (Customer.name.ilike(like))
        )

    return sort_and_paginate(query, Quotation, _QUOTATION_SORTABLE_FIELDS, sort, page, page_size)


def create_quotation(db: Session, data: dict, user_id: int | None = None) -> Quotation:
    customer = (
        db.query(Customer)
        .filter(Customer.id == data["customer_id"], Customer.deleted_at.is_(None))
        .first()
    )
    if customer is None:
        raise ValidationAppError(f"Customer {data['customer_id']} not found.")

    # A quotation can only be raised off a feasibility check that came back
    # feasible, or one Sales explicitly exception-approved despite a raw
    # material shortfall -- there's no "skip feasibility" path.
    feasibility_id = data["feasibility_id"]
    feasibility_service.mark_converted(db, feasibility_id, user_id=user_id)

    lines = _price_lines(db, [dict(line) for line in data.pop("lines")])
    total_amount = round(sum(line["line_total"] for line in lines), 2)

    quotation_number = number_series_service.next_number(db, "QUOTATION")

    quotation = Quotation(
        quotation_number=quotation_number,
        total_amount=total_amount,
        created_by=user_id,
        **data,
    )
    quotation.lines = [QuotationDetail(**line) for line in lines]

    db.add(quotation)
    db.flush()
    audit_service.log_create(db, TABLE_NAME, quotation.id, user_id)
    db.commit()
    db.refresh(quotation)
    return get_quotation(db, quotation.id)


def update_quotation(db: Session, quotation_id: int, data: dict, user_id: int | None = None) -> Quotation:
    quotation = get_quotation(db, quotation_id)
    if quotation.status != "draft":
        raise ConflictError("Only draft quotations can be edited.")

    changes: dict[str, tuple[Any, Any]] = {}

    if "customer_id" in data and data["customer_id"] is not None:
        customer = (
            db.query(Customer)
            .filter(Customer.id == data["customer_id"], Customer.deleted_at.is_(None))
            .first()
        )
        if customer is None:
            raise ValidationAppError(f"Customer {data['customer_id']} not found.")

    lines = data.pop("lines", None)
    # customer_id is required on the model; a None here means "not supplied"
    # rather than "clear it", so drop it if absent/blank.
    if data.get("customer_id") is None:
        data.pop("customer_id", None)

    for field, new_value in data.items():
        old_value = getattr(quotation, field)
        if old_value != new_value:
            changes[field] = (old_value, new_value)
            setattr(quotation, field, new_value)

    if lines is not None:
        priced = _price_lines(db, [dict(line) for line in lines])
        quotation.lines.clear()
        db.flush()
        quotation.lines = [QuotationDetail(**line) for line in priced]
        quotation.total_amount = round(sum(line["line_total"] for line in priced), 2)
        changes["lines"] = ("(previous lines)", "(updated lines)")

    quotation.updated_by = user_id
    audit_service.log_update(db, TABLE_NAME, quotation_id, changes, user_id)
    db.commit()
    return get_quotation(db, quotation_id)


def change_status(
    db: Session,
    quotation_id: int,
    new_status: str,
    reason: str | None = None,
    user_id: int | None = None,
) -> Quotation:
    if new_status == "converted":
        raise ConflictError(
            "Quotations become 'converted' automatically when converted to an order "
            "(POST /api/orders/from-quotation/{quotation_id}); it cannot be set directly."
        )
    quotation = get_quotation(db, quotation_id)
    allowed = ALLOWED_TRANSITIONS.get(quotation.status, set())
    if new_status not in allowed:
        raise ConflictError(
            f"Cannot move quotation from '{quotation.status}' to '{new_status}'."
        )

    if new_status in STATUSES_REQUIRING_CLOSE_REASON and not (reason and reason.strip()):
        raise ValidationAppError(
            "A reason is required to close a quotation without generating an order."
        )

    old_status = quotation.status
    quotation.status = new_status
    if new_status in STATUSES_REQUIRING_CLOSE_REASON:
        quotation.close_reason = reason
    quotation.updated_by = user_id
    audit_service.log_update(
        db, TABLE_NAME, quotation_id, {"status": (old_status, new_status)}, user_id
    )
    db.commit()
    return get_quotation(db, quotation_id)


def delete_quotation(db: Session, quotation_id: int, user_id: int | None = None) -> None:
    quotation = get_quotation(db, quotation_id)
    if quotation.status == "converted":
        raise ConflictError(
            "This quotation has been converted to an order and cannot be deleted."
        )
    quotation.deleted_at = datetime.now(timezone.utc)
    audit_service.log_delete(db, TABLE_NAME, quotation_id, user_id)
    db.commit()


def restore_quotation(db: Session, quotation_id: int, user_id: int | None = None) -> Quotation:
    quotation = get_quotation(db, quotation_id, include_deleted=True)
    quotation.deleted_at = None
    audit_service.log_restore(db, TABLE_NAME, quotation_id, user_id)
    db.commit()
    return get_quotation(db, quotation_id)
