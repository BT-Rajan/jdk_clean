from datetime import date
from typing import Any

from sqlalchemy.orm import Session, joinedload

from app.core.exceptions import AppError, ConflictError, NotFoundError, ValidationAppError
from app.core.pagination import sort_and_paginate
from app.core.pricing import compute_document_totals, price_line
from app.core.timezone import now_kuwait_naive, today_kuwait
from app.core.workflow import assert_reason_given, assert_transition_allowed, assert_within_backdate_window
from app.models.customer import Customer
from app.models.delivery_note import DeliveryNote, DeliveryNoteLine
from app.models.order import (
    ALLOWED_TRANSITIONS,
    OPEN_STATUSES,
    RESERVED_STATUSES,
    STATUSES_REQUIRING_CLOSE_REASON,
    Order,
    OrderDetail,
)
from app.models.product import Product
from app.services import (
    audit_service,
    deal_service,
    inventory_service,
    number_series_service,
    production_order_service,
    settings_service,
)

TABLE_NAME = "orders"


def _price_lines(db: Session, lines: list[dict]) -> list[dict]:
    product_ids = {line["product_id"] for line in lines}
    products = (
        db.query(Product.id, Product.status)
        .filter(Product.id.in_(product_ids), Product.deleted_at.is_(None))
        .all()
    )
    found_ids = {pid for pid, _ in products}
    missing = product_ids - found_ids
    if missing:
        raise ValidationAppError(f"Product {sorted(missing)[0]} not found.")
    # P11: a product deactivated after being sold before must not be
    # sellable again on a new order line -- mirrors production_order_
    # service._get_active_product's own check for the production side.
    inactive = [pid for pid, status in products if status != "active"]
    if inactive:
        raise ValidationAppError(f"Product {sorted(inactive)[0]} is inactive and cannot be ordered.")

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


def get_order(db: Session, order_id: int, include_deleted: bool = False, for_update: bool = False) -> Order:
    if for_update:
        # A plain, unjoined lock query -- with_for_update() on top of
        # _base_query's joinedloads would try to lock every outer-joined
        # table too, which Postgres refuses ("FOR UPDATE cannot be applied
        # to the nullable side of an outer join"). Locking just the order
        # row is all change_status needs: it only ever mutates the order
        # itself and inventory rows, never a line.
        query = db.query(Order).filter(Order.id == order_id)
        if not include_deleted:
            query = query.filter(Order.deleted_at.is_(None))
        obj = query.with_for_update().first()
    else:
        obj = _base_query(db, include_deleted).filter(Order.id == order_id).first()
    if obj is None:
        raise NotFoundError("Order")
    return obj


def get_fulfillment(db: Session, order_id: int) -> list[dict]:
    """Per order line: how much is ordered, delivered, and still
    outstanding, set against what's actually sitting in released FG
    stock right now -- the P8 spec's stock-driven fulfilment view
    (section 7): Customer Orders consume available stock, they don't own
    production output, so this reads plain, ordinary FinishedGoodsInventory
    the same way every other stock question in this app does.

    Deliberately reads quantity_on_hand, not quantity_available (on-hand
    minus every order's reservation): this order's own remaining
    quantity was already reserved in full at confirm time (see
    change_status's 'confirmed' branch), so netting reservations again
    here would make an already-confirmed order look short of stock that
    is, physically, sitting on the shelf for it. Which order actually
    gets physical stock when several compete for less than is on hand is
    decided at delivery time, first-come-first-served, by
    inventory_service.adjust_stock's own hard on-hand guard -- see that
    branch's own comment on reserve_stock's deliberately permissive
    stance. This is a display figure, not a second allocation engine.

    production_order_service.get_pipeline_quantity supplies the existing
    planned/in-progress production for the same product, so a shortage
    here is never mistaken for a fresh, un-planned requirement (spec
    section 10) -- it's for production planning to see, not something
    this function acts on.
    """
    order = get_order(db, order_id)

    delivered_by_product: dict[int, float] = {}
    for product_id, quantity in (
        db.query(DeliveryNoteLine.product_id, DeliveryNoteLine.quantity_delivered)
        .join(DeliveryNote)
        .filter(
            DeliveryNote.order_id == order.id,
            DeliveryNote.deleted_at.is_(None),
            DeliveryNote.status == "issued",
        )
        .all()
    ):
        delivered_by_product[product_id] = delivered_by_product.get(product_id, 0.0) + float(quantity)

    lines = []
    for line in order.lines:
        ordered_quantity = float(line.quantity)
        delivered_quantity = round(delivered_by_product.get(line.product_id, 0.0), 4)
        remaining_quantity = round(max(ordered_quantity - delivered_quantity, 0.0), 4)
        available_fg = round(inventory_service.get_stock(db, "product", line.product_id)["quantity_on_hand"], 4)
        fulfillable_now = round(min(remaining_quantity, available_fg), 4) if remaining_quantity > 0 else 0.0
        shortage = round(max(remaining_quantity - available_fg, 0.0), 4)
        pipeline = production_order_service.get_pipeline_quantity(db, line.product_id)
        lines.append(
            {
                "order_detail_id": line.id,
                "product_id": line.product_id,
                "product_code": line.product.code if line.product else None,
                "product_name": line.product.name if line.product else None,
                "unit": line.product.unit if line.product else None,
                "ordered_quantity": ordered_quantity,
                "delivered_quantity": delivered_quantity,
                "remaining_quantity": remaining_quantity,
                "available_fg": available_fg,
                "fulfillable_now": fulfillable_now,
                "shortage": shortage,
                "planned_production_quantity": pipeline["planned_quantity"],
                "in_progress_production_quantity": pipeline["in_progress_quantity"],
            }
        )
    return lines


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
        # Matches Order Number, Client Name, Client ID (customer_number)
        # and Quotation Number -- the quotation link is a reverse FK
        # (Quotation.converted_order_id -> Order.id, same relationship
        # order_journey_service reads), so it's an EXISTS subquery rather
        # than a join that would otherwise duplicate an order's row once
        # per matching quotation (there's normally only ever one, but a
        # join is still the wrong tool for a search filter regardless).
        from app.models.quotation import Quotation

        like = f"%{search}%"
        quotation_match = (
            db.query(Quotation.id)
            .filter(Quotation.converted_order_id == Order.id, Quotation.quotation_number.ilike(like))
            .exists()
        )
        query = query.join(Customer).filter(
            Order.order_number.ilike(like)
            | Customer.name.ilike(like)
            | Customer.customer_number.ilike(like)
            | quotation_match
        )

    return sort_and_paginate(query, Order, _ORDER_SORTABLE_FIELDS, sort, page, page_size)


def create_order(db: Session, data: dict, user_id: int | None = None, *, _stock_verified: bool = False) -> Order:
    """Builds and saves a brand new order from raw customer_id/lines data --
    NOT reachable directly from the public API. Every order a person
    promises to a customer for future delivery must come from an accepted
    quotation instead (create_order_from_quotation), which itself can't
    exist without a feasibility check confirming the stock/capacity to
    fulfill it -- creating one straight from arbitrary lines skips that
    entirely, silently promising stock that was never actually checked.

    _stock_verified is not part of any request schema and can only be set
    by a trusted internal caller that has *already* verified availability
    itself right before calling this -- currently only log_sale, which
    checks finished-goods stock on hand for a sale that's already
    physically happened (a fact being recorded, not a future commitment),
    so the feasibility check this guard otherwise stands in for doesn't
    apply to it the same way.
    """
    if not _stock_verified:
        raise ConflictError(
            "Orders can only be created from an accepted quotation (which itself requires a "
            "feasibility check) -- use POST /api/orders/from-quotation/{quotation_id}, or start "
            "from a quotation in the app, instead of creating one directly."
        )

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


# An order in any of these statuses still has a delivery ahead of it, so
# its confirmed_delivery_date is still a live commitment worth revising.
# 'draft' is deliberately excluded -- update_order already covers a
# draft order's confirmed_delivery_date like any other field, with no
# reason required, since nothing's been promised to the customer yet.
# 'shipped'/'delivered'/'cancelled' are excluded the other way: the
# delivery already happened (or the order's closed), so there's nothing
# left to re-commit to.
DELIVERY_DATE_CHANGEABLE_STATUSES = {"confirmed", "in_production", "ready_to_ship"}


def change_delivery_date(
    db: Session, order_id: int, new_date: date, reason: str, user_id: int | None = None
) -> Order:
    """Revises the delivery date Sales already committed to (see
    change_status's 'confirmed' branch, which is the only other place
    confirmed_delivery_date gets set once an order leaves 'draft').
    Deliberately a separate action from update_order rather than one
    more field that function happens to allow past 'draft': once a date
    has been promised, moving it is a decision production/delivery
    planning needs to see coming and Sales needs to be able to explain
    later, not a silent edit -- so a reason is mandatory and, like every
    other order field change, it lands in the audit trail (see
    audit_service.get_history / GET /{order_id}/history) rather than a
    bespoke history table of its own.
    """
    order = get_order(db, order_id)
    if order.status not in DELIVERY_DATE_CHANGEABLE_STATUSES:
        if order.status == "draft":
            raise ConflictError("A draft order's delivery date can be changed via the ordinary edit form.")
        raise ConflictError(
            f"Cannot change the delivery date of an order that is '{order.status}' -- "
            "the delivery has already happened or the order is closed."
        )
    assert_reason_given(reason, "A reason is required to change a confirmed delivery date.")

    old_date = order.confirmed_delivery_date
    if old_date == new_date:
        return order

    order.confirmed_delivery_date = new_date
    order.updated_by = user_id
    audit_service.log_update(
        db,
        TABLE_NAME,
        order_id,
        {
            "confirmed_delivery_date": (
                old_date.isoformat() if old_date else None,
                new_date.isoformat(),
            ),
            "delivery_date_change_reason": (None, reason),
        },
        user_id,
    )
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
    today = today_kuwait()
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
        _stock_verified=True,
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


def get_confirm_block_reasons(db: Session, order: Order) -> list[str]:
    """Every reason this order (still 'draft') cannot move to 'confirmed'
    right now without an admin's sign-off -- large discount, or a
    customer over/near their credit limit. Shared by change_status
    (which raises on these) and GET /{order_id}/confirm-check (which
    just reports them, so Sales can see 'Awaiting admin approval:
    <specific reason>' on a blocked order without having to attempt --
    and fail -- the confirm action first to find out why.

    Returns an empty list once order.approved_at is set (an admin has
    already cleared whatever applied at approval time) or if nothing
    currently blocks it -- callers that only care about the blocked
    case should check order.approved_at themselves first, same as
    change_status does, since a still-empty list here doesn't by
    itself mean "no approval was ever needed."
    """
    block_reasons: list[str] = []

    threshold = settings_service.get_effective_discount_approval_threshold(db, customer=order.customer)
    if threshold is not None:
        largest = max(
            [float(order.discount_percent)] + [float(line.discount_percent) for line in order.lines],
            default=0.0,
        )
        if largest >= threshold:
            block_reasons.append(
                f"a discount of {largest}%, at or above the large-discount approval threshold ({threshold}%)"
            )

    # Credit limit: 0 (the field's default) means nobody's set one for
    # this customer yet, so it's treated as "not enforced" -- see
    # payment_service.get_customer_credit_status.
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

    return block_reasons


def get_order_block_status(db: Session, order_id: int) -> dict:
    """Read-only answer to 'why is this order blocked right now' for the
    order detail page -- so Sales can see the specific reason (or that
    there isn't one) without guessing from a greyed-out button or
    triggering the real transition just to read its error. Only
    meaningful for a 'draft' order (the only status the large-discount/
    credit-limit gate applies to); every other status reports simply
    not blocked, since nothing else in the workflow silently gates a
    transition the way confirm does.
    """
    order = get_order(db, order_id)
    if order.status != "draft" or order.approved_at is not None:
        return {"blocked": False, "reasons": [], "requires_admin_approval": False}

    reasons = get_confirm_block_reasons(db, order)
    return {
        "blocked": bool(reasons),
        "reasons": reasons,
        "requires_admin_approval": bool(reasons),
    }


def _assert_order_completable(db: Session, order: Order) -> None:
    """Blocks a manual jump to 'delivered' -- this app's terminal
    "completed" state -- while this order still has real obligations
    open: an unfinished production batch, order lines that haven't
    actually shipped yet, or an unpaid balance. Without this, "delivered"
    was reachable directly from 'shipped' with no check at all, so a
    person could mark an order done while stock was still mid-production
    or the customer still owed money for it.
    """
    from app.models.production_schedule import ProductionSchedule

    open_batches = (
        db.query(ProductionSchedule)
        .filter(
            ProductionSchedule.order_id == order.id,
            ProductionSchedule.deleted_at.is_(None),
            ProductionSchedule.status.in_(("planned", "in_progress", "paused")),
        )
        .count()
    )
    if open_batches:
        raise ConflictError(
            f"Cannot mark this order delivered: {open_batches} production batch(es) are still open against it."
        )

    undelivered = round(sum(line["remaining_quantity"] for line in get_fulfillment(db, order.id)), 4)
    if undelivered > 0.0001:
        raise ConflictError(
            f"Cannot mark this order delivered: {undelivered} unit(s) across its lines are still undelivered."
        )

    from app.services import payment_service

    balance_due = round(float(order.total_amount) - payment_service.get_order_amount_paid(db, order.id), 2)
    if balance_due > 0.01:
        raise ConflictError(
            f"Cannot mark this order delivered: {balance_due:.2f} is still outstanding on payment."
        )


def get_next_action(db: Session, order: Order) -> str:
    """Single human-readable sentence for 'what should happen to this
    order next', derived from its current status and the real state of
    its production/delivery/payment obligations -- so a person can see
    what's actually next without piecing it together from the order,
    production, delivery and payment tabs separately.
    """
    if order.status == "cancelled":
        return "None — order is cancelled."

    if order.status == "draft":
        if order.approved_at is None and get_confirm_block_reasons(db, order):
            return "Awaiting admin approval before this order can be confirmed."
        return "Confirm this order to reserve stock and begin fulfilment."

    from app.services import payment_service

    balance_due = round(float(order.total_amount) - payment_service.get_order_amount_paid(db, order.id), 2)

    if order.status == "delivered":
        if balance_due > 0.01:
            return f"Collect the outstanding balance of {balance_due:.2f}."
        return "None — order is fully delivered and paid."

    if order.status in ("confirmed", "in_production"):
        from app.models.production_schedule import ProductionSchedule

        open_batches = (
            db.query(ProductionSchedule)
            .filter(
                ProductionSchedule.order_id == order.id,
                ProductionSchedule.deleted_at.is_(None),
                ProductionSchedule.status.in_(("planned", "in_progress", "paused")),
            )
            .count()
        )
        if open_batches:
            return "Production in progress — wait for the scheduled batch(es) to complete."
        if any(line["shortage"] > 0 for line in get_fulfillment(db, order.id)):
            return "Schedule production to cover the remaining shortage."
        return "Move this order to ready-to-ship — it's fully coverable from stock."

    if order.status == "ready_to_ship":
        return "Issue a delivery note to ship this order."

    if order.status == "shipped":
        remaining = sum(line["remaining_quantity"] for line in get_fulfillment(db, order.id))
        if remaining > 0.0001:
            return "Ship the remaining quantity to complete delivery."
        if balance_due > 0.01:
            return f"Collect the outstanding balance of {balance_due:.2f}."
        return "Mark this order as delivered."

    return "Review this order."


def change_status(
    db: Session,
    order_id: int,
    new_status: str,
    reason: str | None = None,
    user_id: int | None = None,
    shipped_lines: list[tuple[int, float]] | None = None,
    delivery_note_id: int | None = None,
    commit: bool = True,
) -> Order:
    # Locks the order row for the whole call (fetch through the final
    # commit below) so two near-simultaneous requests on the same order
    # (double-click, retry, two people) can't both pass the status check
    # and both apply the stock side-effects below -- the second blocks
    # here until the first commits, then re-reads the now-changed status
    # and gets rejected by assert_transition_allowed instead of repeating
    # the reservation/issue. See inventory_service.adjust_stock's
    # commit=False for why this only works together with passing
    # commit=False to every stock call in this function.
    #
    # commit=False (P9) lets delivery_note_service.change_status fold this
    # call's own order-status-and-stock write together with its own
    # note.status write into one single commit -- without it, issuing a
    # delivery note was two separate commits (this function's own
    # unconditional one, then the note's own status update moments
    # later), so a failure in between left the order already shipped and
    # stock already deducted while the delivery note driving it all still
    # sat at 'draft' forever. Every other caller leaves this at its
    # default (True) and is completely unaffected.
    order = get_order(db, order_id, for_update=True)
    assert_transition_allowed(ALLOWED_TRANSITIONS, order.status, new_status, "order")

    # Only ever reachable here as a direct, manual call (ALLOWED_TRANSITIONS
    # only allows 'delivered' from 'shipped') -- the automatic promotion to
    # 'delivered' below (once every line is covered by an issued delivery
    # note) never passes through here with new_status already 'delivered',
    # so this only guards the "force it done" override, not the normal
    # shipping flow.
    if new_status == "delivered":
        _assert_order_completable(db, order)

    if new_status == "confirmed" and order.approved_at is None:
        block_reasons = get_confirm_block_reasons(db, order)
        if block_reasons:
            raise ConflictError(
                "This order needs admin approval before it can be confirmed: " + "; ".join(block_reasons) + "."
            )

    if new_status in STATUSES_REQUIRING_CLOSE_REASON:
        assert_reason_given(reason, "A reason is required to cancel an order.")

    old_status = order.status

    # Populated only along the 'cancelled' branches below, then attached
    # to the returned order as a transient (non-persisted) attribute --
    # see the bottom of this function -- so the caller can tell a person
    # exactly what this cancellation took down with it (reservations
    # released, delivery notes reversed, production batches stopped)
    # instead of a bare "status changed to cancelled".
    cancellation_effects = {
        "released_reservations": [],
        "cancelled_delivery_notes": [],
        "cancelled_production_batches": [],
    }

    # Stock side-effects, kept simple until the MRP/feasibility engine exists:
    # - confirming an order reserves finished-goods stock for each line
    #   (allowed to exceed on-hand -- a shortfall is exactly what MRP will
    #   later flag, not something to block here).
    # - shipping consumes on-hand stock and releases the reservation.
    # - cancelling from any state that had reserved stock releases it.
    if new_status == "confirmed":
        for line in order.lines:
            inventory_service.reserve_stock(db, "product", line.product_id, float(line.quantity), commit=False)
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
        # Referenced to the specific delivery note driving this call when
        # there is one (P9) -- an order can have more than one issued
        # note, so pointing every movement at just the order would make
        # it impossible to tell which physical shipment a given stock
        # movement actually belongs to. Falls back to the order itself
        # only for a force-shipped order with no delivery note involved.
        movement_reference_type = "delivery_note" if delivery_note_id is not None else "order"
        movement_reference_id = delivery_note_id if delivery_note_id is not None else order.id
        for product_id, quantity in lines_to_issue:
            inventory_service.adjust_stock(
                db,
                item_type="product",
                item_id=product_id,
                quantity=-quantity,
                movement_type="issue",
                reference_type=movement_reference_type,
                reference_id=movement_reference_id,
                notes=f"Shipped against {order.order_number}",
                user_id=user_id,
                commit=False,
            )
        # Released proportional to what's actually shipped *this call*,
        # not the order's full original line quantity -- an order can now
        # be shipped across more than one delivery note (see
        # delivery_note_service.py's ELIGIBLE_ORDER_STATUSES comment), each
        # its own call here, so releasing the full reservation on every
        # one would double- (or triple-, ...) release it. A short-shipped
        # *final* note still leaves the unshipped remainder's reservation
        # dangling under this scheme -- same known imprecision as before
        # multi-shipment existed, not a new one.
        for product_id, quantity in lines_to_issue:
            inventory_service.release_reservation(db, "product", product_id, quantity, commit=False)

        # P8 spec section 13: once every line is legitimately covered by
        # what's actually been shipped, the order is done -- move it
        # straight to 'delivered' in this same call rather than leaving
        # it sitting at 'shipped' for someone to close out by hand.
        # Other already-issued delivery notes for this order are read
        # here (status == 'issued'), but the note driving *this* call is
        # deliberately not among them yet -- delivery_note_service.
        # change_status calls in here before flipping its own note's
        # status, so this call's own lines_to_issue (exactly what that
        # note is shipping) are added in separately instead of re-querying
        # for a status flip that hasn't happened yet.
        delivered_by_product: dict[int, float] = {}
        for product_id, quantity in (
            db.query(DeliveryNoteLine.product_id, DeliveryNoteLine.quantity_delivered)
            .join(DeliveryNote)
            .filter(
                DeliveryNote.order_id == order.id,
                DeliveryNote.deleted_at.is_(None),
                DeliveryNote.status == "issued",
            )
            .all()
        ):
            delivered_by_product[product_id] = delivered_by_product.get(product_id, 0.0) + float(quantity)
        for product_id, quantity in lines_to_issue:
            delivered_by_product[product_id] = delivered_by_product.get(product_id, 0.0) + float(quantity)
        if all(
            delivered_by_product.get(line.product_id, 0.0) + 1e-6 >= float(line.quantity) for line in order.lines
        ):
            new_status = "delivered"
    elif new_status == "cancelled" and old_status in RESERVED_STATUSES:
        for line in order.lines:
            inventory_service.release_reservation(db, "product", line.product_id, float(line.quantity), commit=False)
            cancellation_effects["released_reservations"].append(
                {
                    "product_id": line.product_id,
                    "product_name": line.product.name if line.product else None,
                    "quantity": float(line.quantity),
                }
            )
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
        # An order can have more than one issued delivery note now (see
        # delivery_note_service.py's ELIGIBLE_ORDER_STATUSES comment) --
        # reverse what every one of them actually delivered, summed per
        # product, not just whichever note query.first() happened to
        # return.
        issued_notes = (
            db.query(DeliveryNote)
            .filter(
                DeliveryNote.order_id == order.id,
                DeliveryNote.status == "issued",
                DeliveryNote.deleted_at.is_(None),
            )
            .all()
        )
        if issued_notes:
            delivered_by_product: dict[int, float] = {}
            for note in issued_notes:
                for line in note.lines:
                    delivered_by_product[line.product_id] = (
                        delivered_by_product.get(line.product_id, 0.0) + float(line.quantity_delivered)
                    )
            lines_to_return = list(delivered_by_product.items())
        else:
            lines_to_return = [(line.product_id, float(line.quantity)) for line in order.lines]
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
                commit=False,
            )
        # The stock these notes moved is reversed above -- keep each
        # note's own status honest about that (P9 spec section 14/15:
        # a reversed delivery must not still read as a live 'issued'
        # shipment). DeliveryNote.ALLOWED_TRANSITIONS has no user-facing
        # 'issued' -> 'cancelled' transition (issuing one directly would
        # need to reverse its own stock, which delivery_note_service.
        # change_status doesn't do) -- this is the one place that
        # transition is safe, since the reversal above is what's actually
        # moving the stock; this just keeps the note's own record in
        # sync with it.
        for note in issued_notes:
            note.status = "cancelled"
            note.cancel_reason = f"Order {order.order_number} was cancelled after shipment: {reason}"
            note.updated_by = user_id
            audit_service.log_update(
                db, "delivery_notes", note.id, {"status": ("issued", "cancelled")}, user_id
            )
            cancellation_effects["cancelled_delivery_notes"].append(
                {"id": note.id, "delivery_note_number": note.delivery_note_number}
            )
        # Whatever's shipped is reversed above; whatever was reserved but
        # never got that far (a partially-shipped order cancelled before
        # the rest went out -- only possible now that shipping can span
        # more than one delivery note) is forfeit, same as production/PO
        # completing early: release it here rather than leaving it
        # reserved forever for a shipment that's no longer coming.
        delivered_totals = dict(lines_to_return)
        for line in order.lines:
            remaining = float(line.quantity) - delivered_totals.get(line.product_id, 0.0)
            if remaining > 0:
                inventory_service.release_reservation(db, "product", line.product_id, remaining, commit=False)
                cancellation_effects["released_reservations"].append(
                    {
                        "product_id": line.product_id,
                        "product_name": line.product.name if line.product else None,
                        "quantity": remaining,
                    }
                )

    order.status = new_status
    if new_status == "confirmed":
        # Drives escalate_unpaid_orders' "no payment N days after
        # confirm" check -- 'confirmed' is only ever reached once (see
        # ALLOWED_TRANSITIONS), so this never needs to guard against
        # overwriting an earlier value.
        order.confirmed_at = now_kuwait_naive()
        # The moment Sales confirms is the moment they're committing to
        # a delivery date -- if nobody typed a different one in while it
        # was still a draft, that commitment defaults to the customer's
        # own requested date rather than leaving confirmed_delivery_date
        # NULL (which would silently fall back to "no commitment at
        # all" for escalate_overdue_orders and production/delivery
        # planning). Once set here, only change_delivery_date can move
        # it -- see that function's docstring for why a confirmed date
        # can't just be edited like any other field.
        if order.confirmed_delivery_date is None:
            order.confirmed_delivery_date = order.requested_delivery_date
    if new_status in STATUSES_REQUIRING_CLOSE_REASON:
        order.close_reason = reason
        # A deliberate close resolves any pending escalation (overdue-
        # delivery or payment-overdue) -- no more delivery or payment is
        # expected on a cancelled order.
        order.admin_review_required = False
        order.admin_review_reason = None
    order.updated_by = user_id
    audit_service.log_update(db, TABLE_NAME, order_id, {"status": (old_status, new_status)}, user_id)
    if not commit:
        return get_order(db, order_id)
    db.commit()

    if new_status == "confirmed":
        _maybe_auto_schedule_production(db, order_id, user_id)
        _maybe_send_confirmation_email(db, order_id, user_id)
    elif new_status == "ready_to_ship":
        _maybe_auto_create_delivery_note(db, order_id, user_id)
    elif new_status == "cancelled":
        cancellation_effects["cancelled_production_batches"] = _cancel_active_production_batches(
            db, order_id, user_id
        )
        deal_service.reconcile_deal_status(db, order.deal_id, user_id)

    result = get_order(db, order_id)
    if new_status == "cancelled":
        # Transient (non-persisted) attribute -- see OrderOut.from_model,
        # which reads it off the model instance to surface what this
        # cancellation took down with it. get_order above returns the
        # same identity-mapped instance within this session, so it
        # carries this through even though it was set on `order` (or, for
        # `cancelled_production_batches`, computed after re-fetching).
        result.cancellation_effects = cancellation_effects
    return result


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
            db=db,
            to_email=order.customer.email,
            subject=subject,
            body=body,
            attachment_bytes=pdf_bytes,
            attachment_filename=f"{order.order_number}.pdf",
        )
    except AppError:
        return

    order.confirmation_emailed_at = now_kuwait_naive()
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
        order_date=today_kuwait(),
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
        # Same underlying sale/payment obligation as the parent -- the
        # split is a fulfillment detail, not a new commitment, so both
        # the invoice QR code and escalate_unpaid_orders' clock should
        # carry over rather than restart.
        payment_link=order.payment_link,
        confirmed_at=order.confirmed_at,
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
        order.admin_review_reason = None

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


def _cancel_active_production_batches(db: Session, order_id: int, user_id: int | None = None) -> list[dict]:
    """Fires when an order is cancelled: any production batch still tied
    to it that hasn't finished -- 'planned' (not yet started), 'in_progress',
    or 'paused' -- is cancelled too, freeing the machine time and
    worker-hours it was holding for a request that no longer exists.
    Cancelling only releases whatever raw-material reservation is still
    outstanding (planned_quantity minus whatever's already been recorded
    via production_service.log_partial_production) -- any output already
    produced and its materials already consumed, on a batch paused or
    partway through before this cancellation, stand: they're real and
    aren't reversed, same reasoning as a fully completed batch below.
    This is the resource-freeing half of what the automation needs to
    stay honest: it auto-schedules real capacity on confirmation, so it
    has to auto-release that capacity on cancellation too, or a cancelled
    order would silently leave a phantom batch occupying a slot forever.

    A batch that already *completed* before the order was cancelled is
    deliberately left alone -- see the comment on that case in
    _record_output and the note in feasibility_service's finished-goods
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
            ProductionSchedule.status.in_(("planned", "in_progress", "paused")),
        )
        .all()
    )
    if not active_batches:
        return []

    order = db.query(Order).filter(Order.id == order_id).first()
    order_number = order.order_number if order else f"#{order_id}"
    reason = f"Order {order_number} was cancelled" + (f": {order.close_reason}" if order and order.close_reason else ".")

    cancelled: list[dict] = []
    for batch in active_batches:
        try:
            production_service.change_status(db, batch.id, "cancelled", reason=reason, user_id=user_id)
        except (ConflictError, ValidationAppError):
            # Best-effort -- if a batch can't be cancelled for some
            # reason, leave it for a person to sort out rather than
            # blocking the order cancellation itself.
            continue
        cancelled.append({"id": batch.id, "batch_number": batch.batch_number, "status": "cancelled"})
    return cancelled


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
    today = today_kuwait()

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
                "delivery_date": today_kuwait(),
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
    order.approved_at = now_kuwait_naive()
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
    order.payment_requested_at = now_kuwait_naive()
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
    order.deleted_at = now_kuwait_naive()
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
    today = as_of or today_kuwait()

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
            order.admin_review_reason = "overdue_delivery"
            audit_service.log_update(
                db, TABLE_NAME, order.id, {"admin_review_required": (False, True)}, None
            )
            flagged.append(order)

    if flagged:
        db.commit()
    return flagged


# How long an order can sit 'confirmed' (or later) with no payment
# recorded before escalate_unpaid_orders flags it for a manager.
UNPAID_ESCALATION_DAYS = 7


def escalate_unpaid_orders(db: Session, as_of: date | None = None) -> list[Order]:
    """Flags every order that's been confirmed for at least
    UNPAID_ESCALATION_DAYS with no payment recorded against it yet, for
    manager review. Same idempotent, periodic-scan shape as
    escalate_overdue_orders -- only ever targets admin_review_required
    = false candidates, so it never re-flags or clobbers a pending
    overdue-delivery escalation on the same order.
    """
    from app.services import payment_service

    today = as_of or today_kuwait()

    candidates = (
        db.query(Order)
        .filter(
            Order.deleted_at.is_(None),
            Order.status.in_(OPEN_STATUSES),
            Order.close_reason.is_(None),
            Order.admin_review_required.is_(False),
            Order.confirmed_at.isnot(None),
        )
        .all()
    )

    flagged: list[Order] = []
    for order in candidates:
        days_since_confirm = (today - order.confirmed_at.date()).days
        if days_since_confirm < UNPAID_ESCALATION_DAYS:
            continue
        amount_paid = payment_service.get_order_amount_paid(db, order.id)
        if amount_paid >= float(order.total_amount):
            continue
        order.admin_review_required = True
        order.admin_review_reason = "payment_overdue"
        audit_service.log_update(
            db, TABLE_NAME, order.id, {"admin_review_required": (False, True)}, None
        )
        flagged.append(order)

    if flagged:
        db.commit()
    return flagged


def admin_review(db: Session, order_id: int, notes: str, user_id: int | None = None) -> Order:
    """Admin/manager clears a pending escalation (overdue-delivery or
    payment-overdue -- see admin_review_reason), recording their decision."""
    order = get_order(db, order_id)
    if not order.admin_review_required:
        raise ConflictError("This order has no pending admin review.")

    order.admin_review_required = False
    order.admin_review_reason = None
    order.admin_reviewed_at = now_kuwait_naive()
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
    conversion_status, block_reasons = quotation_service.get_conversion_status(quotation)
    if conversion_status != "ready":
        raise ConflictError(" ".join(block_reasons) or "This quotation cannot be converted to an order.")

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
        order_date=today_kuwait(),
        subtotal_amount=quotation.subtotal_amount,
        total_amount=quotation.total_amount,
        notes=f"Converted from quotation {quotation.quotation_number}.",
        payment_link=quotation.payment_link,
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
