from datetime import datetime, timezone

from sqlalchemy.orm import Session, joinedload

from app.core.exceptions import ConflictError, NotFoundError, ValidationAppError
from app.core.pagination import sort_and_paginate
from app.core.workflow import assert_reason_given, assert_transition_allowed
from app.models.delivery_note import ALLOWED_TRANSITIONS, DeliveryNote, DeliveryNoteLine
from app.models.order import Order
from app.models.product import Product
from app.services import audit_service, deal_service, number_series_service

TABLE_NAME = "delivery_notes"

# Only orders in this status can get a delivery note -- the natural
# "ready to be shipped, here's proof it was" point in the sales flow.
# Issuing the note then drives the order the rest of the way to
# 'shipped', reusing order_service.change_status's existing stock-issue
# and reservation-release logic rather than duplicating it here.
ELIGIBLE_ORDER_STATUS = "ready_to_ship"


def _base_query(db: Session, include_deleted: bool = False):
    query = db.query(DeliveryNote).options(
        joinedload(DeliveryNote.order).joinedload(Order.customer),
        joinedload(DeliveryNote.lines).joinedload(DeliveryNoteLine.product),
    )
    if not include_deleted:
        query = query.filter(DeliveryNote.deleted_at.is_(None))
    return query


def get_delivery_note(db: Session, note_id: int, include_deleted: bool = False) -> DeliveryNote:
    obj = _base_query(db, include_deleted).filter(DeliveryNote.id == note_id).first()
    if obj is None:
        raise NotFoundError("Delivery note")
    return obj


_SORTABLE_FIELDS = {
    "delivery_note_number": DeliveryNote.delivery_note_number,
    "delivery_date": DeliveryNote.delivery_date,
    "status": DeliveryNote.status,
    "created_at": DeliveryNote.created_at,
}


def list_delivery_notes(
    db: Session,
    page: int = 1,
    page_size: int = 10,
    search: str | None = None,
    status: str | None = None,
    order_id: int | None = None,
    sort: str | None = None,
) -> dict:
    query = _base_query(db)

    if status:
        query = query.filter(DeliveryNote.status == status)
    if order_id:
        query = query.filter(DeliveryNote.order_id == order_id)
    if search:
        query = query.filter(DeliveryNote.delivery_note_number.ilike(f"%{search}%"))

    return sort_and_paginate(query, DeliveryNote, _SORTABLE_FIELDS, sort, page, page_size)


def _get_eligible_order(db: Session, order_id: int) -> Order:
    order = db.query(Order).filter(Order.id == order_id, Order.deleted_at.is_(None)).first()
    if order is None:
        raise ValidationAppError(f"Order {order_id} not found.")
    if order.status != ELIGIBLE_ORDER_STATUS:
        raise ConflictError(
            f"A delivery note can only be created for an order that is '{ELIGIBLE_ORDER_STATUS}' "
            f"(current status: '{order.status}')."
        )
    existing = (
        db.query(DeliveryNote)
        .filter(
            DeliveryNote.order_id == order_id,
            DeliveryNote.deleted_at.is_(None),
            DeliveryNote.status != "cancelled",
        )
        .first()
    )
    if existing is not None:
        raise ConflictError(
            f"Order {order.order_number} already has a delivery note ({existing.delivery_note_number})."
        )
    return order


def create_delivery_note(db: Session, data: dict, user_id: int | None = None) -> DeliveryNote:
    order = _get_eligible_order(db, data["order_id"])

    lines_in = data.pop("lines", None)
    if lines_in:
        for line in lines_in:
            product = (
                db.query(Product)
                .filter(Product.id == line["product_id"], Product.deleted_at.is_(None))
                .first()
            )
            if product is None:
                raise ValidationAppError(f"Product {line['product_id']} not found.")
    else:
        # Default: mirror the order's own lines exactly -- one delivery
        # note per order for now, so "what was ordered" and "what's being
        # delivered" start out identical and can be adjusted (while still
        # draft) if the actual shipment differs.
        lines_in = [
            {"product_id": ol.product_id, "quantity_delivered": ol.quantity} for ol in order.lines
        ]

    note_number = number_series_service.next_number(db, "DELIVERY_NOTE")
    note = DeliveryNote(delivery_note_number=note_number, created_by=user_id, **data)
    note.lines = [DeliveryNoteLine(**line) for line in lines_in]

    db.add(note)
    db.flush()
    audit_service.log_create(db, TABLE_NAME, note.id, user_id)
    deal_service.advance_stage(db, order.deal_id, "delivery", user_id=user_id)
    db.commit()
    db.refresh(note)
    return get_delivery_note(db, note.id)


def update_delivery_note(db: Session, note_id: int, data: dict, user_id: int | None = None) -> DeliveryNote:
    note = get_delivery_note(db, note_id)
    if note.status != "draft":
        raise ConflictError("Only draft delivery notes can be edited.")

    lines_in = data.pop("lines", None)
    changes: dict[str, tuple] = {}
    for field, new_value in data.items():
        old_value = getattr(note, field)
        if old_value != new_value:
            changes[field] = (old_value, new_value)
            setattr(note, field, new_value)

    if lines_in is not None:
        for line in lines_in:
            product = (
                db.query(Product)
                .filter(Product.id == line["product_id"], Product.deleted_at.is_(None))
                .first()
            )
            if product is None:
                raise ValidationAppError(f"Product {line['product_id']} not found.")
        note.lines.clear()
        db.flush()
        note.lines = [DeliveryNoteLine(**line) for line in lines_in]
        changes["lines"] = ("(previous lines)", "(updated lines)")

    note.updated_by = user_id
    audit_service.log_update(db, TABLE_NAME, note_id, changes, user_id)
    db.commit()
    return get_delivery_note(db, note_id)


def change_status(
    db: Session, note_id: int, new_status: str, reason: str | None = None, user_id: int | None = None
) -> DeliveryNote:
    note = get_delivery_note(db, note_id)
    assert_transition_allowed(ALLOWED_TRANSITIONS, note.status, new_status, "delivery note")

    if new_status == "issued":
        # Local import to avoid a circular import, same pattern
        # production_service.py uses for the same reason.
        from app.services import order_service

        shipped_lines = [(line.product_id, float(line.quantity_delivered)) for line in note.lines]
        order_service.change_status(db, note.order_id, "shipped", user_id=user_id, shipped_lines=shipped_lines)
    elif new_status == "cancelled":
        assert_reason_given(reason, "A reason is required to cancel a delivery note.")
        note.cancel_reason = reason

    old_status = note.status
    note.status = new_status
    note.updated_by = user_id
    audit_service.log_update(db, TABLE_NAME, note_id, {"status": (old_status, new_status)}, user_id)
    db.commit()
    db.refresh(note)
    return get_delivery_note(db, note_id)


def delete_delivery_note(db: Session, note_id: int, user_id: int | None = None) -> None:
    note = get_delivery_note(db, note_id)
    if note.status != "draft":
        raise ConflictError("Only draft delivery notes can be deleted; cancel issued ones instead.")
    note.deleted_at = datetime.now(timezone.utc)
    audit_service.log_delete(db, TABLE_NAME, note_id, user_id)
    db.commit()


def restore_delivery_note(db: Session, note_id: int, user_id: int | None = None) -> DeliveryNote:
    note = get_delivery_note(db, note_id, include_deleted=True)
    note.deleted_at = None
    audit_service.log_restore(db, TABLE_NAME, note_id, user_id)
    db.commit()
    return get_delivery_note(db, note_id)
