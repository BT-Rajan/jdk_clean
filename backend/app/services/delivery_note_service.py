from sqlalchemy.orm import Session, joinedload

from app.core.exceptions import ConflictError, NotFoundError, ValidationAppError
from app.core.pagination import sort_and_paginate
from app.core.sales_scope import scope_by_customer
from app.core.timezone import now_kuwait_naive
from app.core.workflow import assert_reason_given, assert_transition_allowed
from app.models.delivery_note import ALLOWED_TRANSITIONS, DeliveryNote, DeliveryNoteLine
from app.models.order import Order
from app.models.product import Product
from app.services import audit_service, deal_service, inventory_service, number_series_service

TABLE_NAME = "delivery_notes"

# Orders in either of these statuses can get a(nother) delivery note --
# the natural "ready to be shipped, here's proof it was" point in the
# sales flow, or already partway through shipping. An order can now be
# shipped across more than one delivery note (multiple trucks, multiple
# dates): the first issued note moves the order 'ready_to_ship' ->
# 'shipped' (see order_service.ALLOWED_TRANSITIONS' comment on its
# 'shipped' -> 'shipped' entry), and further notes are created and
# issued while the order's already sitting at 'shipped', each one
# capped at whatever's still undelivered per product (see
# _remaining_to_ship below). Issuing drives the order the rest of the
# way via order_service.change_status's existing stock-issue and
# reservation-release logic rather than duplicating it here.
ELIGIBLE_ORDER_STATUSES = ("ready_to_ship", "shipped")


def _base_query(db: Session, include_deleted: bool = False):
    query = db.query(DeliveryNote).options(
        joinedload(DeliveryNote.order).joinedload(Order.customer),
        joinedload(DeliveryNote.lines).joinedload(DeliveryNoteLine.product),
    )
    if not include_deleted:
        query = query.filter(DeliveryNote.deleted_at.is_(None))
    return query


def get_delivery_note(
    db: Session, note_id: int, include_deleted: bool = False, for_update: bool = False
) -> DeliveryNote:
    if for_update:
        # Plain, unjoined lock query -- see order_service.get_order's
        # for_update branch for why _base_query's joinedloads can't be
        # combined with with_for_update().
        query = db.query(DeliveryNote).filter(DeliveryNote.id == note_id)
        if not include_deleted:
            query = query.filter(DeliveryNote.deleted_at.is_(None))
        obj = query.with_for_update().first()
    else:
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
    user=None,
) -> dict:
    query = _base_query(db)
    if user is not None:
        # A note has no customer column of its own -- scope through its order.
        query = scope_by_customer(query.join(Order, Order.id == DeliveryNote.order_id), Order.customer_id, user)

    if status:
        query = query.filter(DeliveryNote.status == status)
    if order_id:
        query = query.filter(DeliveryNote.order_id == order_id)
    if search:
        query = query.filter(DeliveryNote.delivery_note_number.ilike(f"%{search}%"))

    return sort_and_paginate(query, DeliveryNote, _SORTABLE_FIELDS, sort, page, page_size)


def _delivered_or_pending_quantities(db: Session, order_id: int, exclude_note_id: int | None = None) -> dict[int, float]:
    """Per product, how much this order's other non-cancelled delivery
    notes (draft or issued) already account for -- draft ones included,
    not just issued, so two drafts can't each independently claim the
    same units. exclude_note_id leaves out one note's own lines (editing
    that note itself shouldn't have it collide with its own prior figures).
    """
    query = db.query(DeliveryNoteLine).join(DeliveryNote).filter(
        DeliveryNote.order_id == order_id,
        DeliveryNote.deleted_at.is_(None),
        DeliveryNote.status != "cancelled",
    )
    if exclude_note_id is not None:
        query = query.filter(DeliveryNote.id != exclude_note_id)

    totals: dict[int, float] = {}
    for line in query.all():
        totals[line.product_id] = totals.get(line.product_id, 0.0) + float(line.quantity_delivered)
    return totals


def _remaining_to_ship(db: Session, order: Order, exclude_note_id: int | None = None) -> dict[int, float]:
    """Per product, ordered quantity minus what's already spoken for by
    this order's other delivery notes -- what a new (or newly-edited)
    note can still legitimately claim."""
    accounted_for = _delivered_or_pending_quantities(db, order.id, exclude_note_id=exclude_note_id)
    remaining: dict[int, float] = {}
    for line in order.lines:
        left = float(line.quantity) - accounted_for.get(line.product_id, 0.0)
        if left > 0:
            remaining[line.product_id] = left
    return remaining


def _validate_stock_availability(db: Session, product: Product, quantity: float) -> None:
    """P9 spec section 3/6: a delivery must never even be drafted for
    more than what's actually sitting in released Finished Goods stock
    right now. QC-pending/rejected/cancelled production was never
    receipted into FinishedGoodsInventory in the first place (see
    qc_service._release_execution_fg) -- quantity_on_hand here already
    excludes all of it, so no separate QC-status check is needed.

    This is a helpful, early check, not the authoritative gate: stock
    can legitimately change between drafting and issuing (more arrives,
    or another note issues first), so the real, final word is still
    inventory_service.adjust_stock's own hard on-hand guard at issue
    time -- that's what actually stops two notes drafted against the
    same stock from both shipping more than physically exists (P9
    section 12), not this.
    """
    available = inventory_service.get_stock(db, "product", product.id)["quantity_on_hand"]
    if quantity > available:
        raise ValidationAppError(
            f"Cannot deliver {quantity} of {product.name}: only {round(available, 4)} is currently "
            "available in released Finished Goods stock."
        )


def _get_eligible_order(db: Session, order_id: int) -> Order:
    order = db.query(Order).filter(Order.id == order_id, Order.deleted_at.is_(None)).first()
    if order is None:
        raise ValidationAppError(f"Order {order_id} not found.")
    if order.status not in ELIGIBLE_ORDER_STATUSES:
        raise ConflictError(
            f"A delivery note can only be created for an order that is "
            f"{' or '.join(repr(s) for s in ELIGIBLE_ORDER_STATUSES)} (current status: '{order.status}')."
        )
    if not _remaining_to_ship(db, order):
        raise ConflictError(f"Order {order.order_number} is already fully covered by its delivery note(s).")
    return order


def create_delivery_note(db: Session, data: dict, user_id: int | None = None) -> DeliveryNote:
    order = _get_eligible_order(db, data["order_id"])
    remaining = _remaining_to_ship(db, order)

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
            left = remaining.get(line["product_id"], 0.0)
            if float(line["quantity_delivered"]) > left:
                raise ValidationAppError(
                    f"Cannot deliver {line['quantity_delivered']} of {product.name}: "
                    f"only {left:.4f} remains outstanding on this order."
                )
            _validate_stock_availability(db, product, float(line["quantity_delivered"]))
    else:
        # Default: whatever's still outstanding per product, capped at
        # what's actually available in released FG stock right now (P9
        # section 6) -- covers both the simple one-shipment case (mirrors
        # the order's own lines exactly, as before, when stock fully
        # covers it) and a short-stock case (defaults to exactly what
        # can legitimately be delivered today, e.g. 600 of a 1,000-unit
        # order, rather than defaulting to the full 1,000 and failing
        # outright). A product with nothing at all available is left off
        # the draft entirely -- same "only lines with something left"
        # convention _remaining_to_ship already uses.
        lines_in = []
        for product_id, qty in remaining.items():
            available = inventory_service.get_stock(db, "product", product_id)["quantity_on_hand"]
            deliverable = round(min(qty, available), 4)
            if deliverable > 0:
                lines_in.append({"product_id": product_id, "quantity_delivered": deliverable})
        if not lines_in:
            raise ConflictError(
                f"Order {order.order_number} is outstanding, but none of it is currently available in "
                "released Finished Goods stock -- nothing to deliver yet."
            )

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
        remaining = _remaining_to_ship(db, note.order, exclude_note_id=note.id)
        for line in lines_in:
            product = (
                db.query(Product)
                .filter(Product.id == line["product_id"], Product.deleted_at.is_(None))
                .first()
            )
            if product is None:
                raise ValidationAppError(f"Product {line['product_id']} not found.")
            left = remaining.get(line["product_id"], 0.0)
            if float(line["quantity_delivered"]) > left:
                raise ValidationAppError(
                    f"Cannot deliver {line['quantity_delivered']} of {product.name}: "
                    f"only {left:.4f} remains outstanding on this order."
                )
            _validate_stock_availability(db, product, float(line["quantity_delivered"]))
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
    # Locked for the whole call so two near-simultaneous "issue" requests
    # on the same delivery note can't both pass the status check below.
    # The actual stock issue happens inside order_service.change_status
    # (called just below), which takes its own lock on the order row --
    # if a concurrent issue call is already mid-way through that order-
    # level transition, this one blocks on the order lock there and then
    # correctly fails assert_transition_allowed on the order's now-
    # already-"shipped" status, so it never reaches the note.status write
    # below either.
    note = get_delivery_note(db, note_id, for_update=True)
    assert_transition_allowed(ALLOWED_TRANSITIONS, note.status, new_status, "delivery note")

    if new_status == "issued":
        # Local import to avoid a circular import, same pattern
        # production_service.py uses for the same reason.
        from app.services import order_service

        shipped_lines = [(line.product_id, float(line.quantity_delivered)) for line in note.lines]
        # commit=False (P9): the order-status change and its stock
        # movements must land in the SAME commit as this note's own
        # status write below, or a failure between the two would leave
        # the order already shipped and stock already deducted while
        # this delivery note driving it all still sat at 'draft' --
        # exactly the split-transaction bug atomicity requires closing.
        # delivery_note_id lets the resulting stock movement reference
        # this specific note rather than just the order, so an order
        # with more than one delivery note stays traceable to exactly
        # which shipment moved which units.
        order_service.change_status(
            db,
            note.order_id,
            "shipped",
            user_id=user_id,
            shipped_lines=shipped_lines,
            delivery_note_id=note.id,
            commit=False,
        )
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
    note.deleted_at = now_kuwait_naive()
    audit_service.log_delete(db, TABLE_NAME, note_id, user_id)
    db.commit()


def restore_delivery_note(db: Session, note_id: int, user_id: int | None = None) -> DeliveryNote:
    note = get_delivery_note(db, note_id, include_deleted=True)
    note.deleted_at = None
    audit_service.log_restore(db, TABLE_NAME, note_id, user_id)
    db.commit()
    return get_delivery_note(db, note_id)
