from datetime import date, datetime, timezone
from typing import Any

from sqlalchemy.orm import Session, joinedload

from app.core.exceptions import AppError, ConflictError, NotFoundError, ValidationAppError
from app.core.pagination import sort_and_paginate
from app.core.pricing import compute_document_totals, price_line
from app.core.workflow import assert_reason_given, assert_transition_allowed, assert_within_backdate_window
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
    product_ids = {line["product_id"] for line in lines}
    found_ids = {
        pid
        for (pid,) in db.query(Product.id)
        .filter(Product.id.in_(product_ids), Product.deleted_at.is_(None))
        .all()
    }
    missing = product_ids - found_ids
    if missing:
        raise ValidationAppError(f"Product {sorted(missing)[0]} not found.")

    priced: list[dict] = []
    for line in lines:
        discount_percent = float(line.get("discount_percent") or 0)
        line_total = price_line(float(line["quantity"]), float(line["unit_price"]), discount_percent)
        priced.append({**line, "discount_percent": discount_percent, "line_total": line_total})
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

    deal_id = data.pop("deal_id", None)
    lines = _price_lines(db, [dict(line) for line in data.pop("lines")])
    subtotal_amount = round(sum(line["line_total"] for line in lines), 2)
    discount_percent = float(data.pop("discount_percent", None) or 0)
    totals = compute_document_totals(subtotal_amount, discount_percent)

    # Everything above is validation/pricing with no row locks held. Only
    # from here do we touch number_series (SELECT ... FOR UPDATE) so the
    # lock is held for the shortest possible window instead of spanning
    # the whole pricing loop -- that gap was serializing every concurrent
    # order create behind whichever request happened to be pricing lines.
    deal = deal_service.get_or_create_for_new_stage(
        db,
        deal_id=deal_id,
        customer_id=data["customer_id"],
        stage="order",
        user_id=user_id,
    )
    data["deal_id"] = deal.id

    order_number = number_series_service.next_number(db, "ORDER")

    order = Order(
        order_number=order_number,
        subtotal_amount=subtotal_amount,
        discount_percent=discount_percent,
        discount_amount=totals["discount_amount"],
        total_amount=totals["total_amount"],
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
    discount_percent_update = data.pop("discount_percent", None)
    if data.get("customer_id") is None:
        data.pop("customer_id", None)

    for field, new_value in data.items():
        old_value = getattr(order, field)
        if old_value != new_value:
            changes[field] = (old_value, new_value)
            setattr(order, field, new_value)

    if discount_percent_update is not None and float(discount_percent_update) != float(order.discount_percent):
        changes["discount_percent"] = (order.discount_percent, discount_percent_update)
        order.discount_percent = discount_percent_update
        order.approved_at = None
        order.approved_by = None

    if lines is not None:
        priced = _price_lines(db, [dict(line) for line in lines])
        order.lines.clear()
        db.flush()
        order.lines = [OrderDetail(**line) for line in priced]
        order.subtotal_amount = round(sum(line["line_total"] for line in priced), 2)
        changes["lines"] = ("(previous lines)", "(updated lines)")
        order.approved_at = None
        order.approved_by = None

    if lines is not None or discount_percent_update is not None:
        totals = compute_document_totals(float(order.subtotal_amount), float(order.discount_percent))
        order.discount_amount = totals["discount_amount"]
        order.total_amount = totals["total_amount"]

    order.updated_by = user_id
    audit_service.log_update(db, TABLE_NAME, order_id, changes, user_id)
    db.commit()
    return get_order(db, order_id)


def log_sale(
    db: Session,
    customer_id: int,
    lines: list[dict],
    notes: str | None = None,
    entry_date: date | None = None,
    user_id: int | None = None,
) -> Order:
    """One-step logging for a sale that's already happened -- e.g. a
    walk-in/cash sale entered after the fact -- instead of working
    through draft -> confirm -> deliver by hand. Walks that exact same
    pipeline in one call (create_order, then change_status twice, then a
    delivery note created and issued) so it leaves the same paperwork
    trail (an order plus a delivery note) and moves stock through the
    same reserve-then-issue path as always -- there's no separate,
    duplicated "quick" code path.

    `entry_date` defaults to today (e.g. the Orders list's "Log a sale"
    button); the calendar's day-actions popup passes the clicked day
    instead, so a person can catch up on a sale they forgot to log --
    but only up to MAX_BACKDATE_DAYS back, and never into the future
    (see assert_within_backdate_window).

    Every line is checked against available finished-goods stock before
    anything is created; the order is then taken straight from
    'confirmed' to 'ready_to_ship' rather than relying on
    _maybe_auto_schedule_production's judgement call, the same direct
    transition a person could always choose by hand (see
    ALLOWED_TRANSITIONS's comment on 'ready_to_ship') -- a quick-logged
    sale is definitionally already fulfilled from stock on hand, not
    something still waiting on a production run.

    If anything after order creation fails, the order is cancelled
    rather than left sitting half-finished in 'confirmed' or
    'ready_to_ship' with no delivery note -- so a failed quick-log
    doesn't leave a dangling order behind; the caller just sees the
    original error.
    """
    today = datetime.now(timezone.utc).date()
    target_date = entry_date or today
    assert_within_backdate_window(target_date, today, "a sale")

    shortfalls = []
    for line in lines:
        product = (
            db.query(Product)
            .filter(Product.id == line["product_id"], Product.deleted_at.is_(None))
            .first()
        )
        if product is None:
            raise ValidationAppError(f"Product {line['product_id']} not found.")
        if not inventory_service.check_availability(db, "product", line["product_id"], float(line["quantity"])):
            stock = inventory_service.get_stock(db, "product", line["product_id"])
            shortfalls.append(
                f"{product.code} (have {stock['quantity_available']:.4f}, need {line['quantity']})"
            )
    if shortfalls:
        raise ValidationAppError("Not enough stock on hand to log this sale: " + "; ".join(shortfalls))

    order = create_order(
        db,
        {"customer_id": customer_id, "order_date": target_date, "notes": notes, "lines": lines},
        user_id=user_id,
    )
    try:
        change_status(db, order.id, "confirmed", user_id=user_id)
        change_status(db, order.id, "ready_to_ship", user_id=user_id)

        from app.services import delivery_note_service

        note = delivery_note_service.create_delivery_note(
            db, {"order_id": order.id, "delivery_date": target_date}, user_id=user_id
        )
        delivery_note_service.change_status(db, note.id, "issued", user_id=user_id)
    except AppError:
        try:
            change_status(
                db, order.id, "cancelled", reason="Quick-log failed -- see prior error.", user_id=user_id
            )
        except AppError:
            pass
        raise

    return get_order(db, order.id)


def change_status(
    db: Session,
    order_id: int,
    new_status: str,
    reason: str | None = None,
    user_id: int | None = None,
    shipped_lines: list[tuple[int, float]] | None = None,
) -> Order:
    order = get_order(db, order_id)
    assert_transition_allowed(ALLOWED_TRANSITIONS, order.status, new_status, "order")

    if new_status == "confirmed" and order.approved_at is None:
        block_reasons: list[str] = []

        threshold = settings_service.get_large_discount_approval_threshold(db)
        if threshold is not None:
            largest = max(
                [float(order.discount_percent)] + [float(line.discount_percent) for line in order.lines],
                default=0.0,
            )
            if largest >= threshold:
                block_reasons.append(
                    f"a discount of {largest}%, at or above the large-discount approval threshold ({threshold}%)"
                )

        # Credit limit: 0 (the field's default) means nobody's set one
        # for this customer yet, so it's treated as "not enforced" --
        # see payment_service.get_customer_credit_status.
        if float(order.customer.credit_limit) > 0:
            from app.services import payment_service

            if not order.customer.id_verified:
                block_reasons.append(
                    f"{order.customer.name} has a credit limit set but their id isn't verified yet -- "
                    "upload/verify their id document, or get admin approval"
                )

            outstanding = payment_service.get_customer_outstanding_balance(
                db, order.customer_id, exclude_order_id=order.id
            )
            projected = outstanding + float(order.total_amount)
            limit = float(order.customer.credit_limit)
            if projected > limit:
                block_reasons.append(
                    f"would put {order.customer.name} at {projected:.2f} outstanding, over their "
                    f"credit limit of {limit:.2f} (already owe {outstanding:.2f} on other orders) -- "
                    f"record a payment to bring them under the limit, or get admin approval"
                )

        if block_reasons:
            raise ConflictError(
                "This order needs admin approval before it can be confirmed: " + "; ".join(block_reasons) + "."
            )

    if new_status in STATUSES_REQUIRING_CLOSE_REASON:
        assert_reason_given(reason, "A reason is required to cancel an order.")

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
        # Issue against what actually left the building, not what was
        # originally ordered -- delivery_note_service passes its own
        # (possibly hand-edited) lines here when shipping is driven by
        # issuing a delivery note, since a delivery note's quantities can
        # legitimately diverge from the order's (partial/short-ship,
        # substitution) and it's the delivery note that represents the
        # real physical movement. shipped_lines is only ever None when
        # an order is force-shipped with no delivery note involved (e.g.
        # a direct status override), in which case the order's own lines
        # are the only source of truth available.
        lines_to_issue = (
            shipped_lines
            if shipped_lines is not None
            else [(line.product_id, float(line.quantity)) for line in order.lines]
        )
        for product_id, quantity in lines_to_issue:
            inventory_service.adjust_stock(
                db,
                item_type="product",
                item_id=product_id,
                quantity=-quantity,
                movement_type="issue",
                reference_type="order",
                reference_id=order.id,
                notes=f"Shipped against {order.order_number}",
                user_id=user_id,
            )
        # The reservation, however, always tracks what was originally
        # confirmed on the order -- that's the amount reserve_stock
        # actually placed a hold on -- so it's released in full here
        # regardless of what the delivery note ended up saying, or
        # leftover reserved stock would linger uncleared forever.
        for line in order.lines:
            inventory_service.release_reservation(db, "product", line.product_id, float(line.quantity))
    elif new_status == "cancelled" and old_status in RESERVED_STATUSES:
        for line in order.lines:
            inventory_service.release_reservation(db, "product", line.product_id, float(line.quantity))
    elif new_status == "cancelled" and old_status in ("shipped", "delivered"):
        # The goods already left the building -- cancelling here means the
        # customer is refusing or returning them, not that the order never
        # happened. Reverse the actual delivered quantities (from the
        # issued delivery note, since that's what really moved -- see the
        # shipped_lines comment above) back onto the shelf as a genuine,
        # audited 'return' movement rather than silently flipping a status
        # flag, matching the terminal-state philosophy used everywhere else
        # (DeliveryNote.ALLOWED_TRANSITIONS): reversing a completed physical
        # event must itself be a real, traceable action.
        delivery_note = (
            db.query(DeliveryNote)
            .filter(
                DeliveryNote.order_id == order.id,
                DeliveryNote.status == "issued",
                DeliveryNote.deleted_at.is_(None),
            )
            .first()
        )
        lines_to_return = (
            [(line.product_id, float(line.quantity_delivered)) for line in delivery_note.lines]
            if delivery_note is not None
            else [(line.product_id, float(line.quantity)) for line in order.lines]
        )
        for product_id, quantity in lines_to_return:
            inventory_service.adjust_stock(
                db,
                item_type="product",
                item_id=product_id,
                quantity=quantity,
                movement_type="return",
                reference_type="order",
                reference_id=order.id,
                notes=f"Cancelled after shipment -- {order.order_number} ({reason})",
                user_id=user_id,
            )

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
        _maybe_send_confirmation_email(db, order_id, user_id)
    elif new_status == "ready_to_ship":
        _maybe_auto_create_delivery_note(db, order_id, user_id)
    elif new_status == "cancelled":
        _cancel_active_production_batches(db, order_id, user_id)
        deal_service.reconcile_deal_status(db, order.deal_id, user_id)

    return get_order(db, order_id)


def _maybe_send_confirmation_email(db: Session, order_id: int, user_id: int | None = None) -> None:
    """Fires the moment an order is confirmed -- draft only ever moves
    forward to 'confirmed' once (see ALLOWED_TRANSITIONS), so this is
    the order's genuine "first email": Admin -> Documents -> Email
    Templates -> "Order confirmation" rendered with this order's own
    details and sent straight to the customer on file, PDF attached,
    same as the manual "Send email" button generates. Never raises --
    a person can always send it by hand afterward from the order's own
    page -- and is silently skipped (no confirmation_emailed_at set)
    if the customer has no email on file, same as the rest of this
    file's auto-* hooks never blocking the transition that triggered
    them.
    """
    from app.services import email_service, email_template_service, pdf_generator

    order = get_order(db, order_id)
    if not order.customer or not order.customer.email:
        return

    try:
        company_settings = pdf_generator.get_company_settings(db)
        signer = pdf_generator.resolve_signer(db, order.created_by)
        pdf_bytes = pdf_generator.generate_order_pdf(order, company_settings, signer=signer)
        subject, body = email_template_service.render(
            db,
            "order_confirmation",
            {
                "customer_name": order.customer.name,
                "order_number": order.order_number,
                "order_date": order.order_date.isoformat(),
                "total_amount": f"{float(order.total_amount):,.2f}",
                "company_name": company_settings.get("company_name", ""),
            },
        )
        email_service.send_document_email(
            to_email=order.customer.email,
            subject=subject,
            body=body,
            attachment_bytes=pdf_bytes,
            attachment_filename=f"{order.order_number}.pdf",
        )
    except AppError:
        return

    order.confirmation_emailed_at = datetime.now(timezone.utc)
    db.commit()


def split_order(db: Session, order_id: int, lines: list[dict], user_id: int | None = None) -> Order:
    """Carves a deliverable-now quantity off a 'ready_to_ship' order into
    a brand new child order, for the classic scarce-stock scenario: three
    orders total 300 bags, only 200 are actually on the shelf, so a
    smaller amount goes out to each now and the rest follows once more
    stock is in. Splitting only makes sense at 'ready_to_ship' -- by then
    production is done (or was never needed) and the only thing actually
    short is what's physically on hand, which is exactly what a delivery
    note captures. Splitting earlier (still 'confirmed'/'in_production')
    would also have to reason about a production batch already tied to
    the parent's original quantity, and duplicating or resizing that is
    a person's judgement call, not something to guess at here.

    Stock reservation needs zero bookkeeping of its own: quantity_reserved
    (FinishedGoodsInventory) is a running total per product, not scoped
    to one order, so leaving it untouched while simply repartitioning the
    same total quantity across parent-remainder + child keeps the
    aggregate correct automatically. Only the lines and totals move.

    The child inherits the parent's customer/deal/dates/discount/
    approval (a smaller quantity than what was already approved carries
    strictly less risk, so re-gating it would be pure friction) and is
    born directly at 'ready_to_ship' -- the same auto-create-delivery-
    note hook a normal order reaching that status would trigger fires
    for it too, so it's immediately actionable exactly like any other
    order at that stage.

    If the parent has an existing draft delivery note, it's deleted --
    it mirrored the parent's original (now stale) quantities (see
    delivery_note_service.create_delivery_note), so it no longer
    reflects what's actually being shipped; a fresh one gets created for
    whatever remains, same as for the child. If every line was split
    away, the parent has nothing left to fulfil and closes itself
    (status='cancelled') without releasing any reservation -- the child
    now carries it forward, not fewer physical units suddenly appearing
    on the shelf.
    """
    order = get_order(db, order_id)
    if order.status != "ready_to_ship":
        raise ConflictError(
            "Orders can only be split while 'ready_to_ship' -- once it's clear at the point of "
            f"dispatch that stock can't cover it in full (current status: '{order.status}')."
        )
    if not lines:
        raise ValidationAppError("At least one line item is required to split an order.")

    lines_by_id = {line.id: line for line in order.lines}
    child_lines: list[dict] = []
    for split in lines:
        source = lines_by_id.get(split["order_detail_id"])
        if source is None:
            raise ValidationAppError(f"Line {split['order_detail_id']} does not belong to this order.")
        quantity = float(split["quantity"])
        if quantity > float(source.quantity):
            raise ValidationAppError(
                f"Cannot split {quantity} of {source.product.name}: only {float(source.quantity):.4f} "
                "is on this line."
            )
        child_lines.append(
            {
                "product_id": source.product_id,
                "quantity": quantity,
                "unit_price": float(source.unit_price),
                "discount_percent": float(source.discount_percent),
                "line_total": price_line(quantity, float(source.unit_price), float(source.discount_percent)),
            }
        )
        remaining = round(float(source.quantity) - quantity, 4)
        if remaining <= 0:
            db.delete(source)
        else:
            source.quantity = remaining
            source.line_total = price_line(remaining, float(source.unit_price), float(source.discount_percent))
    db.flush()

    from app.services import delivery_note_service

    existing_note = (
        db.query(DeliveryNote)
        .filter(
            DeliveryNote.order_id == order.id,
            DeliveryNote.deleted_at.is_(None),
            DeliveryNote.status == "draft",
        )
        .first()
    )
    if existing_note is not None:
        delivery_note_service.delete_delivery_note(db, existing_note.id, user_id=user_id)

    # Recompute the parent's totals from whatever lines are still on it
    # (some may have just been deleted above).
    db.refresh(order)
    parent_subtotal = round(sum(float(ln.line_total) for ln in order.lines), 2)
    order.subtotal_amount = parent_subtotal
    parent_totals = compute_document_totals(parent_subtotal, float(order.discount_percent))
    order.discount_amount = parent_totals["discount_amount"]
    order.total_amount = parent_totals["total_amount"]
    order.updated_by = user_id

    child_subtotal = round(sum(line["line_total"] for line in child_lines), 2)
    child_totals = compute_document_totals(child_subtotal, float(order.discount_percent))
    child = Order(
        order_number=number_series_service.next_number(db, "ORDER"),
        customer_id=order.customer_id,
        deal_id=order.deal_id,
        order_date=datetime.now(timezone.utc).date(),
        requested_delivery_date=order.requested_delivery_date,
        confirmed_delivery_date=order.confirmed_delivery_date,
        status="ready_to_ship",
        subtotal_amount=child_subtotal,
        discount_percent=order.discount_percent,
        discount_amount=child_totals["discount_amount"],
        total_amount=child_totals["total_amount"],
        notes=f"Split from {order.order_number} -- stock only covered part of it at dispatch.",
        approved_at=order.approved_at,
        approved_by=order.approved_by,
        parent_order_id=order.id,
        created_by=user_id,
    )
    child.lines = [OrderDetail(**line) for line in child_lines]
    db.add(child)
    db.flush()

    parent_fully_split = not order.lines
    if parent_fully_split:
        order.status = "cancelled"
        order.close_reason = f"Fully split into child order {child.order_number}."
        order.admin_review_required = False

    audit_service.log_create(db, TABLE_NAME, child.id, user_id)
    audit_service.log_update(
        db, TABLE_NAME, order.id, {"lines": ("(previous lines)", f"(split into {child.order_number})")}, user_id
    )
    db.commit()

    # Both orders are now sitting at 'ready_to_ship' with correct, final
    # quantities but no delivery note (the parent's stale one was deleted
    # above; the child never had one) -- the same auto-create hook a
    # normal order reaching 'ready_to_ship' would trigger fires for each,
    # so both are immediately actionable rather than needing a person to
    # notice and create one by hand.
    _maybe_auto_create_delivery_note(db, child.id, user_id)
    if not parent_fully_split:
        _maybe_auto_create_delivery_note(db, order.id, user_id)

    return get_order(db, child.id)


def _cancel_active_production_batches(db: Session, order_id: int, user_id: int | None = None) -> None:
    """Fires when an order is cancelled: any production batch still tied
    to it that hasn't finished -- 'planned' (auto-scheduled or not, not
    yet started) or 'in_progress' (started, but no materials consumed or
    finished goods produced yet -- that only happens on completion, see
    production_service._complete_batch) -- is cancelled too, freeing the
    machine time and worker-hours it was holding for a request that no
    longer exists. This is the resource-freeing half of what the
    automation needs to stay honest: it auto-schedules real capacity on
    confirmation, so it has to auto-release that capacity on cancellation
    too, or a cancelled order would silently leave a phantom batch
    occupying a slot forever.

    A batch that already *completed* before the order was cancelled is
    deliberately left alone -- see the comment on that case in
    _complete_batch and the note in feasibility_service's finished-goods
    netting: the materials are genuinely consumed and the units genuinely
    exist, so there's nothing to reverse. The stock reservation on those
    finished units is already released above (RESERVED_STATUSES), which
    is what actually matters -- they become ordinary available inventory
    a future feasibility check can find and use instead of ever
    reproducing them.
    """
    from app.models.production_schedule import ProductionSchedule

    from app.services import production_service

    active_batches = (
        db.query(ProductionSchedule)
        .filter(
            ProductionSchedule.order_id == order_id,
            ProductionSchedule.deleted_at.is_(None),
            ProductionSchedule.status.in_(("planned", "in_progress")),
        )
        .all()
    )
    if not active_batches:
        return

    order = db.query(Order).filter(Order.id == order_id).first()
    order_number = order.order_number if order else f"#{order_id}"
    reason = f"Order {order_number} was cancelled" + (f": {order.close_reason}" if order and order.close_reason else ".")

    for batch in active_batches:
        try:
            production_service.change_status(db, batch.id, "cancelled", reason=reason, user_id=user_id)
        except (ConflictError, ValidationAppError):
            # Best-effort -- if a batch can't be cancelled for some
            # reason, leave it for a person to sort out rather than
            # blocking the order cancellation itself.
            continue


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
    from app.services import capacity_service, inventory_service, production_service

    order = get_order(db, order_id)
    today = datetime.now(timezone.utc).date()

    any_batch_created = False
    any_line_unresolved = False

    for line in order.lines:
        product = line.product

        # Net off finished-goods stock that already exists, same as
        # feasibility_service.run_check does when first deciding whether
        # this request is achievable -- without this, confirming an order
        # that a feasibility check already recognized as fully (or
        # partially) covered by existing stock would still auto-schedule
        # production for the *entire* line, over-producing and cluttering
        # the machine's calendar with a batch nobody actually needs. This
        # check doesn't depend on the product having a machine/time
        # formula -- stock can cover a line regardless of whether we'd
        # even be able to auto-schedule its production.
        #
        # By the time this hook runs, reserve_stock has already claimed
        # `line.quantity` of this product for this order (see the
        # 'confirmed' branch above, which runs before this hook), so
        # quantity_reserved includes this order's own hold on it.
        # Subtracting that back out gives what's genuinely already
        # on-hand and free to satisfy this exact line from existing
        # stock, independent of what this order itself just reserved.
        stock = inventory_service.get_stock(db, "product", line.product_id)
        available_from_existing_stock = max(
            stock["quantity_on_hand"] - (stock["quantity_reserved"] - float(line.quantity)), 0.0
        )
        covered_by_stock = min(float(line.quantity), available_from_existing_stock)
        quantity_to_produce = round(float(line.quantity) - covered_by_stock, 4)
        if quantity_to_produce <= 0:
            continue  # nothing needed for this line -- resolved, no batch, no manual follow-up

        if product is None or product.machine_id is None or product.production_hours_per_unit is None:
            # Genuinely needs producing, but there's no formula to
            # auto-schedule against -- Production has to pick this up by
            # hand, so the order can't be auto-advanced past it.
            any_line_unresolved = True
            continue

        machine = db.query(Machine).filter(Machine.id == product.machine_id).first()
        if machine is None:
            any_line_unresolved = True
            continue

        required_hours = round(quantity_to_produce * float(product.production_hours_per_unit), 4)

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
        working_days = settings_service.get_working_days(db)
        completion = capacity_service.find_vacant_slot_completion(
            float(machine.capacity_hours_per_day), daily_booked, required_hours, today, working_days
        )
        if completion is None:
            # Not achievable within the scan horizon -- leave it for a
            # person to schedule by hand with a judgement call this
            # automation isn't positioned to make.
            any_line_unresolved = True
            continue

        try:
            production_service.create_batch(
                db,
                {
                    "product_id": line.product_id,
                    "machine_id": machine.id,
                    "order_id": order.id,
                    "planned_quantity": quantity_to_produce,
                    "scheduled_start": today,
                    "scheduled_end": completion,
                    "auto_scheduled": True,
                    "notes": (
                        f"Auto-scheduled on confirmation of {order.order_number}"
                        + (
                            f" ({covered_by_stock} of {float(line.quantity)} already covered by existing stock)."
                            if covered_by_stock > 0
                            else "."
                        )
                    ),
                },
                user_id=user_id,
            )
            any_batch_created = True
        except (ConflictError, ValidationAppError):
            # Best-effort convenience, not a hard requirement -- a person
            # can still schedule this line's production by hand.
            any_line_unresolved = True
            continue

    if order.lines and not any_batch_created and not any_line_unresolved:
        # Every line was fully covered by existing finished-goods stock --
        # there is nothing left to produce at all, so no batch ever
        # started to drive the usual 'confirmed' -> 'in_production' ->
        # 'ready_to_ship' progression (see production_service's
        # _start_batch / _maybe_advance_order_to_ready_to_ship hooks).
        # Skip straight to 'ready_to_ship' instead of leaving the order
        # stranded at 'confirmed' with nothing to move it forward.
        try:
            change_status(db, order_id, "ready_to_ship", user_id=user_id)
        except (ConflictError, ValidationAppError):
            pass


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


def approve_order(db: Session, order_id: int, user_id: int | None = None) -> Order:
    """Admin sign-off clearing whichever of the two confirm-time gates
    above actually applied (large discount, over the customer's credit
    limit, or both -- change_status's error names which) -- can be
    called any time an order is still draft, whether or not it's
    actually blocked by either right now."""
    order = get_order(db, order_id)
    if order.status != "draft":
        raise ConflictError("Only a draft order can be approved.")
    order.approved_at = datetime.now(timezone.utc)
    order.approved_by = user_id
    order.updated_by = user_id
    audit_service.log_update(
        db, TABLE_NAME, order_id, {"approved_at": (None, order.approved_at.isoformat())}, user_id
    )
    db.commit()
    return get_order(db, order_id)


def mark_payment_requested(db: Session, order_id: int, user_id: int | None = None) -> Order:
    """Records that a payment-request email just went out for this order
    -- purely a timestamp for Sales to see "sent N days ago, still
    nothing recorded" (see api/orders.py's request_payment and
    payment_service.py). Doesn't touch order status or block anything;
    can be called any number of times as a reminder."""
    order = get_order(db, order_id)
    order.payment_requested_at = datetime.now(timezone.utc)
    order.updated_by = user_id
    audit_service.log_update(
        db, TABLE_NAME, order_id, {"payment_requested_at": (None, order.payment_requested_at.isoformat())}, user_id
    )
    db.commit()
    return get_order(db, order_id)


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
        subtotal_amount=quotation.subtotal_amount,
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
