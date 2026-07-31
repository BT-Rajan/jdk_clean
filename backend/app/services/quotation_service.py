from datetime import date, datetime, timezone
from typing import Any

from sqlalchemy.orm import Session, joinedload

from app.core.exceptions import ConflictError, NotFoundError, ValidationAppError
from app.core.pagination import sort_and_paginate
from app.core.pricing import compute_document_totals, price_line
from app.core.workflow import assert_reason_given, assert_transition_allowed
from app.models.customer import Customer
from app.models.product import Product
from app.models.quotation import (
    ALLOWED_TRANSITIONS,
    STATUSES_REQUIRING_CLOSE_REASON,
    Quotation,
    QuotationDetail,
)
from app.services import audit_service, deal_service, feasibility_service, number_series_service, settings_service

TABLE_NAME = "quotations"


def _price_lines(db: Session, lines: list[dict]) -> list[dict]:
    """Validate referenced products exist and compute each line's total,
    net of that line's own discount_percent (default 0)."""
    priced: list[dict] = []
    for line in lines:
        product = (
            db.query(Product)
            .filter(Product.id == line["product_id"], Product.deleted_at.is_(None))
            .first()
        )
        if product is None:
            raise ValidationAppError(f"Product {line['product_id']} not found.")
        discount_percent = float(line.get("discount_percent") or 0)
        line_total = price_line(float(line["quantity"]), float(line["unit_price"]), discount_percent)
        priced.append({**line, "discount_percent": discount_percent, "line_total": line_total})
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

    # A quotation can be raised off a feasibility check that came back
    # feasible, or one Sales explicitly exception-approved despite a raw
    # material shortfall -- or created standalone with no check at all
    # (see FeasibilityCreate/QuotationCreate: feasibility_id is optional).
    # If given, mark that check converted and inherit its deal; otherwise
    # this quotation starts its own new deal.
    feasibility_id = data.get("feasibility_id")
    if feasibility_id:
        feasibility_service.mark_converted(db, feasibility_id, user_id=user_id)
        if not data.get("deal_id"):
            checked = feasibility_service.get_feasibility(db, feasibility_id)
            data["deal_id"] = checked.deal_id

    deal = deal_service.get_or_create_for_new_stage(
        db,
        deal_id=data.pop("deal_id", None),
        customer_id=data["customer_id"],
        stage="quotation",
        user_id=user_id,
    )
    data["deal_id"] = deal.id

    lines = _price_lines(db, [dict(line) for line in data.pop("lines")])
    subtotal_amount = round(sum(line["line_total"] for line in lines), 2)
    tax_rate = data.pop("tax_rate", None)
    if tax_rate is None:
        tax_rate = settings_service.get_default_tax_rate(db)
    discount_percent = float(data.pop("discount_percent", None) or 0)
    totals = compute_document_totals(subtotal_amount, discount_percent, tax_rate)

    quotation_number = number_series_service.next_number(db, "QUOTATION")

    quotation = Quotation(
        quotation_number=quotation_number,
        subtotal_amount=subtotal_amount,
        tax_rate=tax_rate,
        discount_percent=discount_percent,
        discount_amount=totals["discount_amount"],
        tax_amount=totals["tax_amount"],
        total_amount=totals["total_amount"],
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
    tax_rate_update = data.pop("tax_rate", None)
    discount_percent_update = data.pop("discount_percent", None)
    # customer_id is required on the model; a None here means "not supplied"
    # rather than "clear it", so drop it if absent/blank.
    if data.get("customer_id") is None:
        data.pop("customer_id", None)

    for field, new_value in data.items():
        old_value = getattr(quotation, field)
        if old_value != new_value:
            changes[field] = (old_value, new_value)
            setattr(quotation, field, new_value)

    if tax_rate_update is not None and float(tax_rate_update) != float(quotation.tax_rate):
        changes["tax_rate"] = (quotation.tax_rate, tax_rate_update)
        quotation.tax_rate = tax_rate_update

    if discount_percent_update is not None and float(discount_percent_update) != float(quotation.discount_percent):
        changes["discount_percent"] = (quotation.discount_percent, discount_percent_update)
        quotation.discount_percent = discount_percent_update
        quotation.approved_at = None
        quotation.approved_by = None

    if lines is not None:
        priced = _price_lines(db, [dict(line) for line in lines])
        quotation.lines.clear()
        db.flush()
        quotation.lines = [QuotationDetail(**line) for line in priced]
        quotation.subtotal_amount = round(sum(line["line_total"] for line in priced), 2)
        changes["lines"] = ("(previous lines)", "(updated lines)")
        quotation.approved_at = None
        quotation.approved_by = None

    if lines is not None or tax_rate_update is not None or discount_percent_update is not None:
        totals = compute_document_totals(
            float(quotation.subtotal_amount), float(quotation.discount_percent), float(quotation.tax_rate)
        )
        quotation.discount_amount = totals["discount_amount"]
        quotation.tax_amount = totals["tax_amount"]
        quotation.total_amount = totals["total_amount"]

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
    assert_transition_allowed(ALLOWED_TRANSITIONS, quotation.status, new_status, "quotation")

    if new_status == "sent":
        threshold = settings_service.get_large_discount_approval_threshold(db)
        if threshold is not None and quotation.approved_at is None:
            largest = max(
                [float(quotation.discount_percent)] + [float(line.discount_percent) for line in quotation.lines],
                default=0.0,
            )
            if largest >= threshold:
                raise ConflictError(
                    f"This quotation has a discount of {largest}%, at or above the large-discount "
                    f"approval threshold ({threshold}%), and needs admin approval before it can be sent."
                )

    if new_status in STATUSES_REQUIRING_CLOSE_REASON:
        assert_reason_given(reason, "A reason is required to close a quotation without generating an order.")

    old_status = quotation.status
    quotation.status = new_status
    if new_status in STATUSES_REQUIRING_CLOSE_REASON:
        quotation.close_reason = reason
    quotation.updated_by = user_id
    audit_service.log_update(
        db, TABLE_NAME, quotation_id, {"status": (old_status, new_status)}, user_id
    )
    db.commit()

    if new_status in ("rejected", "expired"):
        deal_service.reconcile_deal_status(db, quotation.deal_id, user_id)

    return get_quotation(db, quotation_id)


def approve_quotation(db: Session, quotation_id: int, user_id: int | None = None) -> Quotation:
    """Admin sign-off clearing the large-discount gate above -- can be
    called any time a quotation is still draft, whether or not it's
    actually at/above the current threshold (the threshold can change
    after the quotation was drafted; approving early never hurts)."""
    quotation = get_quotation(db, quotation_id)
    if quotation.status != "draft":
        raise ConflictError("Only a draft quotation can be approved.")
    quotation.approved_at = datetime.now(timezone.utc)
    quotation.approved_by = user_id
    quotation.updated_by = user_id
    audit_service.log_update(
        db, TABLE_NAME, quotation_id, {"approved_at": (None, quotation.approved_at.isoformat())}, user_id
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


def escalate_expired_quotations(db: Session, as_of: date | None = None) -> list[Quotation]:
    """'expired' is a real, reachable status (ALLOWED_TRANSITIONS allows
    'sent' -> 'expired') but nothing ever actually moved a quotation there
    -- a sent quotation whose valid_until had passed just sat in 'sent'
    forever unless someone happened to notice and closed it by hand. This
    is the same 'reachable but never triggered' gap the stale-feasibility-
    check scan already covers for a different status; this is quotations'
    version of it. Meant to be run periodically; idempotent -- only
    'sent' quotations past their valid_until are ever touched, and once
    expired they're excluded by the status filter on the next run.
    """
    today = as_of or datetime.now(timezone.utc).date()

    candidates = (
        db.query(Quotation)
        .filter(
            Quotation.deleted_at.is_(None),
            Quotation.status == "sent",
            Quotation.valid_until.isnot(None),
        )
        .all()
    )

    expired: list[Quotation] = []
    for quotation in candidates:
        if quotation.valid_until < today:
            old_status = quotation.status
            quotation.status = "expired"
            audit_service.log_update(
                db, TABLE_NAME, quotation.id, {"status": (old_status, "expired")}, None
            )
            expired.append(quotation)

    if expired:
        db.commit()
        for quotation in expired:
            deal_service.reconcile_deal_status(db, quotation.deal_id, None)
        db.commit()
    return expired
