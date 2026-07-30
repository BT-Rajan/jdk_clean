from datetime import date, datetime, timezone
from typing import Any

from sqlalchemy.orm import Session, joinedload

from app.core.exceptions import ConflictError, NotFoundError, ValidationAppError
from app.core.pagination import sort_and_paginate
from app.core.workflow import assert_reason_given, assert_transition_allowed
from app.models.customer import Customer
from app.models.delivery_note import DeliveryNote
from app.models.order import (
    ALLOWED_TRANSITIONS,
    OPEN_STATUSES,
    RESERVED_STATUSES,
    STATUSES_REQUIRING_CLOSE_REASON,
    Order,
    OrderDetail,
)
from app.models.product import Product
from app.services import audit_service, deal_service, inventory_service, number_series_service, settings_service

TABLE_NAME = "orders"


def _price_lines(db: Session, lines: list[dict]) -> list[dict]:
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
    query = db.query(Order).options(
        joinedload(Order.customer),
        joinedload(Order.lines).joinedload(OrderDetail.product),
    )
    if not include_deleted:
        query = query.filter(Order.deleted_at.is_(None))
    return query


def get_order(db: Session, order_id: int, include_deleted: bool = False) -> Order:
    obj = _base_query(db, include_deleted).filter(Order.id == order_id).first()
    if obj is None:
        raise NotFoundError("Order")
    return obj


_ORDER_SORTABLE_FIELDS = {
    "order_number": Order.order_number,
    "order_date": Order.order_date,
    "total_amount": Order.total_amount,
    "status": Order.status,
    "created_at": Order.created_at,
}


def list_orders(
    db: Session,
    page: int = 1,
    page_size: int = 25,
    search: str | None = None,
    status: str | None = None,
    customer_id: int | None = None,
    admin_review_required: bool | None = None,
    sort: str | None = None,
) -> dict:
    query = _base_query(db)

    if status:
        query = query.filter(Order.status == status)
    if customer_id:
        query = query.filter(Order.customer_id == customer_id)
    if admin_review_required is not None:
        query = query.filter(Order.admin_review_required == admin_review_required)
    if search:
        like = f"%{search}%"
        query = query.join(Customer).filter(
            (Order.order_number.ilike(like)) | (Customer.name.ilike(like))
        )

    return sort_and_paginate(query, Order, _ORDER_SORTABLE_FIELDS, sort, page, page_size)


def create_order(db: Session, data: dict, user_id: int | None = None) -> Order:
    customer = (
        db.query(Customer)
        .filter(Customer.id == data["customer_id"], Customer.deleted_at.is_(None))
        .first()
    )
    if customer is None:
        raise ValidationAppError(f"Customer {data['customer_id']} not found.")

    deal = deal_service.get_or_create_for_new_stage(
        db,
        deal_id=data.pop("deal_id", None),
        customer_id=data["customer_id"],
        stage="order",
        user_id=user_id,
    )
    data["deal_id"] = deal.id

    lines = _price_lines(db, [dict(line) for line in data.pop("lines")])
    total_amount = round(sum(line["line_total"] for line in lines), 2)

    order_number = number_series_service.next_number(db, "ORDER")

    order = Order(
        order_number=order_number,
        total_amount=total_amount,
        created_by=user_id,
        **data,
    )
    order.lines = [OrderDetail(**line) for line in lines]

    db.add(order)
    db.flush()
    audit_service.log_create(db, TABLE_NAME, order.id, user_id)
    db.commit()
    db.refresh(order)
    return get_order(db, order.id)


def update_order(db: Session, order_id: int, data: dict, user_id: int | None = None) -> Order:
    order = get_order(db, order_id)
    if order.status != "draft":
        raise ConflictError("Only draft orders can be edited.")

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
    if data.get("customer_id") is None:
        data.pop("customer_id", None)

    for field, new_value in data.items():
        old_value = getattr(order, field)
        if old_value != new_value:
            changes[field] = (old_value, new_value)
            setattr(order, field, new_value)

    if lines is not None:
        priced = _price_lines(db, [dict(line) for line in lines])
        order.lines.clear()
        db.flush()
        order.lines = [OrderDetail(**line) for line in priced]
        order.total_amount = round(sum(line["line_total"] for line in priced), 2)
        changes["lines"] = ("(previous lines)", "(updated lines)")

    order.updated_by = user_id
    audit_service.log_update(db, TABLE_NAME, order_id, changes, user_id)
    db.commit()
    return get_order(db, order_id)


def change_status(
    db: Session,
    order_id: int,
    new_status: str,
    reason: str | None = None,
    user_id: int | None = None,
) -> Order:
    order = get_order(db, order_id)
    assert_transition_allowed(ALLOWED_TRANSITIONS, order.status, new_status, "order")

    if new_status in STATUSES_REQUIRING_CLOSE_REASON:
        assert_reason_given(reason, "A reason is required to cancel an order without a delivery note.")

    old_status = order.status

    # Stock side-effects, kept simple until the MRP/feasibility engine exists:
    # - confirming an order reserves finished-goods stock for each line
    #   (allowed to exceed on-hand -- a shortfall is exactly what MRP will
    #   later flag, not something to block here).
    # - shipping consumes on-hand stock and releases the reservation.
    # - cancelling from any state that had reserved stock releases it.
    if new_status == "confirmed":
        for line in order.lines:
            inventory_service.reserve_stock(db, "product", line.product_id, float(line.quantity))
    elif new_status == "shipped":
        for line in order.lines:
            inventory_service.adjust_stock(
                db,
                item_type="product",
                item_id=line.product_id,
                quantity=-float(line.quantity),
                movement_type="issue",
                reference_type="order",
                reference_id=order.id,
                notes=f"Shipped against {order.order_number}",
                user_id=user_id,
            )
            inventory_service.release_reservation(db, "product", line.product_id, float(line.quantity))
    elif new_status == "cancelled" and old_status in RESERVED_STATUSES:
        for line in order.lines:
            inventory_service.release_reservation(db, "product", line.product_id, float(line.quantity))

    order.status = new_status
    if new_status in STATUSES_REQUIRING_CLOSE_REASON:
        order.close_reason = reason
        # A deliberate close resolves any pending overdue-delivery escalation.
        order.admin_review_required = False
    order.updated_by = user_id
    audit_service.log_update(db, TABLE_NAME, order_id, {"status": (old_status, new_status)}, user_id)
    db.commit()

    if new_status == "confirmed":
        _maybe_auto_schedule_production(db, order_id, user_id)
    elif new_status == "ready_to_ship":
        _maybe_auto_create_delivery_note(db, order_id, user_id)

    return get_order(db, order_id)


def _maybe_auto_schedule_production(db: Session, order_id: int, user_id: int | None = None) -> None:
    """Fires the moment an order is confirmed -- the same "auto create,
    with role-based flexibility" pattern as feasibility_service's
    auto-quotation hook, one joint further along: if enabled (Settings ->
    Production, admin/manager-only to change), schedules a production
    batch for each line whose product has a machine + time formula set
    (machine_id and production_hours_per_unit -- see products' formula
    fields), using the same vacant-slot capacity scan the feasibility
    check itself uses to decide whether a request is achievable.

    Lines whose product has no formula are silently skipped -- there's
    nothing to schedule against, same as the feasibility capacity check
    treating a formula-less product as "not evaluable" rather than an
    error. Never raises: an auto-schedule failure should never break
    order confirmation. Every batch it creates is a completely normal
    batch afterward -- edit or cancel it like any other.
    """
    if not settings_service.is_auto_schedule_production_enabled(db):
        return

    # Local imports: production_service already imports order_service (to
    # advance a batch's order to 'in_production' when it starts), so
    # importing production_service back here at module level would be
    # circular.
    from app.models.machine import Machine
    from app.services import capacity_service, production_service

    order = get_order(db, order_id)
    today = datetime.now(timezone.utc).date()

    for line in order.lines:
        product = line.product
        if product is None or product.machine_id is None or product.production_hours_per_unit is None:
            continue

        machine = db.query(Machine).filter(Machine.id == product.machine_id).first()
        if machine is None:
            continue

        required_hours = round(float(line.quantity) * float(product.production_hours_per_unit), 4)

        from app.models.production_schedule import ProductionSchedule as PS

        booked_batches = (
            db.query(PS)
            .filter(
                PS.machine_id == machine.id,
                PS.deleted_at.is_(None),
                PS.status.in_(capacity_service.BOOKED_PRODUCTION_STATUSES),
                PS.scheduled_end >= today,
            )
            .all()
        )
        daily_booked = capacity_service.daily_booked_hours(booked_batches, hours_field="machine")
        completion = capacity_service.find_vacant_slot_completion(
            float(machine.capacity_hours_per_day), daily_booked, required_hours, today
        )
        if completion is None:
            # Not achievable within the scan horizon -- leave it for a
            # person to schedule by hand with a judgement call this
            # automation isn't positioned to make.
            continue

        try:
            production_service.create_batch(
                db,
                {
                    "product_id": line.product_id,
                    "machine_id": machine.id,
                    "order_id": order.id,
                    "planned_quantity": float(line.quantity),
                    "scheduled_start": today,
                    "scheduled_end": completion,
                    "auto_scheduled": True,
                    "notes": f"Auto-scheduled on confirmation of {order.order_number}.",
                },
                user_id=user_id,
            )
        except (ConflictError, ValidationAppError):
            # Best-effort convenience, not a hard requirement -- a person
            # can still schedule this line's production by hand.
            continue


def _maybe_auto_create_delivery_note(db: Session, order_id: int, user_id: int | None = None) -> None:
    """Fires the moment an order becomes ready to ship -- whether a
    person set that directly, or production_service auto-advanced it
    once every batch completed. The last joint in the pipeline, same
    "auto create, with role-based flexibility" pattern as the two
    upstream hooks: if enabled (Settings -> Delivery, admin/manager-only
    to change), drafts a delivery note automatically -- delivery_date
    defaulted to today, lines auto-populated from the order itself (see
    delivery_note_service.create_delivery_note) -- instead of leaving it
    for Sales/Warehouse to create by hand. The draft is a completely
    normal delivery note afterward: the delivery date, quantities, and
    everything else can be adjusted before it's issued. Never raises.
    """
    if not settings_service.is_auto_create_delivery_note_enabled(db):
        return

    # Local import: delivery_note_service already imports order_service
    # (to move an order to 'shipped' when its note is issued), so
    # importing delivery_note_service back here at module level would be
    # circular.
    from app.services import delivery_note_service

    try:
        delivery_note_service.create_delivery_note(
            db,
            {
                "order_id": order_id,
                "delivery_date": datetime.now(timezone.utc).date(),
                "auto_created": True,
                "notes": "Auto-created when the order became ready to ship.",
            },
            user_id=user_id,
        )
    except (ConflictError, ValidationAppError):
        # Best-effort convenience, not a hard requirement -- Sales or
        # Warehouse can still create the delivery note by hand.
        pass


def delete_order(db: Session, order_id: int, user_id: int | None = None) -> None:
    order = get_order(db, order_id)
    if order.status != "draft":
        raise ConflictError("Only draft orders can be deleted; cancel confirmed orders instead.")
    order.deleted_at = datetime.now(timezone.utc)
    audit_service.log_delete(db, TABLE_NAME, order_id, user_id)
    db.commit()


def restore_order(db: Session, order_id: int, user_id: int | None = None) -> Order:
    order = get_order(db, order_id, include_deleted=True)
    order.deleted_at = None
    audit_service.log_restore(db, TABLE_NAME, order_id, user_id)
    db.commit()
    return get_order(db, order_id)


def escalate_overdue_orders(db: Session, as_of: date | None = None) -> list[Order]:
    """Flags every still-open order whose delivery date has passed with
    neither a delivery note issued nor a close reason recorded, for admin
    approval. Meant to be run periodically (e.g. an external cron hitting
    the scan endpoint); idempotent -- re-running only (re)flags orders that
    still qualify, it never clears admin_review_required itself (only
    change_status on cancel, or admin_review, does that).
    """
    today = as_of or datetime.now(timezone.utc).date()

    overdue_order_ids = {
        row.order_id
        for row in db.query(DeliveryNote.order_id)
        .filter(DeliveryNote.status == "issued", DeliveryNote.deleted_at.is_(None))
        .all()
    }

    candidates = (
        db.query(Order)
        .filter(
            Order.deleted_at.is_(None),
            Order.status.in_(OPEN_STATUSES),
            Order.close_reason.is_(None),
            Order.admin_review_required.is_(False),
        )
        .all()
    )

    flagged: list[Order] = []
    for order in candidates:
        if order.id in overdue_order_ids:
            continue
        due_date = order.confirmed_delivery_date or order.requested_delivery_date
        if due_date is not None and due_date < today:
            order.admin_review_required = True
            audit_service.log_update(
                db, TABLE_NAME, order.id, {"admin_review_required": (False, True)}, None
            )
            flagged.append(order)

    if flagged:
        db.commit()
    return flagged


def admin_review(db: Session, order_id: int, notes: str, user_id: int | None = None) -> Order:
    """Admin clears an overdue-delivery escalation, recording their decision."""
    order = get_order(db, order_id)
    if not order.admin_review_required:
        raise ConflictError("This order has no pending admin review.")

    order.admin_review_required = False
    order.admin_reviewed_at = datetime.now(timezone.utc)
    order.admin_reviewed_by = user_id
    order.admin_review_notes = notes
    order.updated_by = user_id
    audit_service.log_update(
        db, TABLE_NAME, order_id, {"admin_review_required": (True, False)}, user_id
    )
    db.commit()
    return get_order(db, order_id)


def create_order_from_quotation(db: Session, quotation_id: int, user_id: int | None = None) -> Order:
    """Converts an accepted quotation into a new draft order, copying its
    customer and line items, then marks the quotation as 'converted' and
    links it to the new order via converted_order_id.
    """
    # Imported here (not at module top) to avoid a circular import, since
    # quotation_service doesn't need to know about orders at all.
    from app.services import quotation_service

    quotation = quotation_service.get_quotation(db, quotation_id)
    if quotation.status != "accepted":
        raise ConflictError(
            f"Only accepted quotations can be converted to an order (current status: '{quotation.status}')."
        )

    order_number = number_series_service.next_number(db, "ORDER")
    lines = [
        {
            "product_id": line.product_id,
            "quantity": line.quantity,
            "unit_price": line.unit_price,
            "line_total": line.line_total,
        }
        for line in quotation.lines
    ]

    deal = deal_service.get_or_create_for_new_stage(
        db,
        deal_id=quotation.deal_id,
        customer_id=quotation.customer_id,
        stage="order",
        user_id=user_id,
    )

    order = Order(
        order_number=order_number,
        customer_id=quotation.customer_id,
        deal_id=deal.id,
        order_date=datetime.now(timezone.utc).date(),
        total_amount=quotation.total_amount,
        notes=f"Converted from quotation {quotation.quotation_number}.",
        created_by=user_id,
    )
    order.lines = [OrderDetail(**line) for line in lines]

    db.add(order)
    db.flush()
    audit_service.log_create(db, TABLE_NAME, order.id, user_id)

    old_status = quotation.status
    quotation.status = "converted"
    quotation.converted_order_id = order.id
    quotation.updated_by = user_id
    audit_service.log_update(
        db,
        "quotations",
        quotation.id,
        {"status": (old_status, "converted"), "converted_order_id": (None, order.id)},
        user_id,
    )

    db.commit()
    return get_order(db, order.id)
