from sqlalchemy.orm import Session, joinedload

from app.core.exceptions import ConflictError, NotFoundError, ValidationAppError
from app.core.pagination import sort_and_paginate
from app.core.workflow import assert_reason_given, assert_transition_allowed
from app.models.order import Order, OrderDetail
from app.models.production_order import ALLOWED_TRANSITIONS, ELIGIBLE_ORDER_STATUSES, ProductionOrder
from app.services import audit_service, deal_service, number_series_service

TABLE_NAME = "production_orders"


def _base_query(db: Session):
    return db.query(ProductionOrder).options(
        joinedload(ProductionOrder.order).joinedload(Order.customer),
        joinedload(ProductionOrder.order_detail),
        joinedload(ProductionOrder.product),
    )


def get_production_order(db: Session, production_order_id: int) -> ProductionOrder:
    obj = _base_query(db).filter(ProductionOrder.id == production_order_id).first()
    if obj is None:
        raise NotFoundError("Production order")
    return obj


_SORTABLE_FIELDS = {
    "production_order_number": ProductionOrder.production_order_number,
    "due_date": ProductionOrder.due_date,
    "status": ProductionOrder.status,
    "priority": ProductionOrder.priority,
    "created_at": ProductionOrder.created_at,
}


def list_production_orders(
    db: Session,
    page: int = 1,
    page_size: int = 10,
    search: str | None = None,
    status: str | None = None,
    order_id: int | None = None,
    order_detail_id: int | None = None,
    product_id: int | None = None,
    sort: str | None = None,
) -> dict:
    query = _base_query(db)

    if status:
        query = query.filter(ProductionOrder.status == status)
    if order_id:
        query = query.filter(ProductionOrder.order_id == order_id)
    if order_detail_id:
        query = query.filter(ProductionOrder.order_detail_id == order_detail_id)
    if product_id:
        query = query.filter(ProductionOrder.product_id == product_id)
    if search:
        query = query.join(Order, ProductionOrder.order_id == Order.id).filter(
            (ProductionOrder.production_order_number.ilike(f"%{search}%"))
            | (Order.order_number.ilike(f"%{search}%"))
        )

    return sort_and_paginate(query, ProductionOrder, _SORTABLE_FIELDS, sort, page, page_size)


def _committed_quantity(db: Session, order_detail_id: int, for_update: bool = False) -> float:
    """Sum of planned_quantity across every non-cancelled Production
    Order for this order line -- the one place this is computed, so the
    creation check and the read-model can never disagree.

    `for_update=True` (the creation path) issues a locking read instead
    of a plain SELECT. This matters under this app's default REPEATABLE
    READ isolation: a request's DB transaction typically starts with a
    plain read well before this function ever runs (the auth dependency
    loading the current user), which fixes that transaction's snapshot
    right there. A plain SELECT here would then keep seeing that early
    snapshot even after this function's caller has waited on and
    acquired the order-line's row lock -- silently missing a sibling
    Production Order another request just committed while we waited,
    which is exactly the over-allocation race this whole lock exists to
    prevent. A locking read has no such blind spot: it always reads (and
    holds a lock on) the latest committed rows regardless of when the
    transaction's snapshot was established. Verified empirically against
    this app's actual MariaDB setup, not assumed from general MySQL docs.
    The read-only display path (`get_remaining_quantity`) doesn't need
    this -- it isn't gating a decision, so a plain read is fine there.
    """
    query = db.query(ProductionOrder.planned_quantity).filter(
        ProductionOrder.order_detail_id == order_detail_id,
        ProductionOrder.status != "cancelled",
    )
    if for_update:
        query = query.with_for_update()
    return sum(float(row[0]) for row in query.all())


def get_remaining_quantity(db: Session, order_detail_id: int) -> float:
    """How much of this order line has not yet been committed to any
    (non-cancelled) Production Order.

    Deliberately does not net off anything already produced --
    execution/completion doesn't exist yet in this pass (see
    docs/production-lifecycle.md), so "already produced" is always zero
    for every Production Order today. A later pass that adds actual
    output tracking should extend this function, not duplicate it.
    """
    order_detail = db.query(OrderDetail).filter(OrderDetail.id == order_detail_id).first()
    if order_detail is None:
        raise NotFoundError("Order line")
    return round(float(order_detail.quantity) - _committed_quantity(db, order_detail_id), 4)


def create_production_order(db: Session, data: dict, user_id: int | None = None) -> ProductionOrder:
    """Transactional: locks the order line for the duration of this check
    + insert so two concurrent requests against the same line can never
    both succeed past the remaining-quantity check -- the second waits for
    the first's row lock, then re-reads the now-updated commitment total.
    Same with_for_update() pattern order_service/production_service
    already use for their own quantity-affecting writes.
    """
    order = db.query(Order).filter(Order.id == data["order_id"], Order.deleted_at.is_(None)).first()
    if order is None:
        raise NotFoundError("Order")
    if order.status not in ELIGIBLE_ORDER_STATUSES:
        raise ConflictError(
            f"Cannot create a production order from an order in '{order.status}' status; "
            f"the order must be confirmed and still open."
        )

    # Locked for the rest of this call -- see docstring above.
    order_detail = (
        db.query(OrderDetail)
        .filter(OrderDetail.id == data["order_detail_id"])
        .with_for_update()
        .first()
    )
    if order_detail is None or order_detail.order_id != order.id:
        raise ValidationAppError("This order line does not belong to the given order.")

    product = order_detail.product
    if product is None or product.deleted_at is not None:
        raise ValidationAppError("This line's product no longer exists.")
    if product.status != "active":
        raise ValidationAppError(f"{product.name} is inactive and cannot be planned for production.")

    planned_quantity = float(data["planned_quantity"])
    remaining = float(order_detail.quantity) - _committed_quantity(db, order_detail.id, for_update=True)
    if remaining <= 0:
        raise ValidationAppError("This order line is already fully committed to production.")
    if planned_quantity > remaining:
        raise ValidationAppError(
            f"Planned quantity ({planned_quantity}) exceeds the remaining order quantity ({round(remaining, 4)})."
        )

    production_order_number = number_series_service.next_number(db, "PRODUCTION_ORDER")
    production_order = ProductionOrder(
        production_order_number=production_order_number,
        order_id=order.id,
        order_detail_id=order_detail.id,
        product_id=product.id,
        planned_quantity=planned_quantity,
        due_date=data["due_date"],
        priority=data.get("priority") or "normal",
        notes=data.get("notes"),
        created_by=user_id,
    )
    db.add(production_order)
    db.flush()
    audit_service.log_create(db, TABLE_NAME, production_order.id, user_id)
    # Same "a later stage attaching to an existing deal" pattern
    # production_service.create_batch already uses -- a Production Order
    # is genuinely production work starting on this deal, whether or not
    # a ProductionSchedule ever gets created for it.
    deal_service.advance_stage(db, order.deal_id, "production", user_id=user_id)
    db.commit()
    return get_production_order(db, production_order.id)


def change_status(
    db: Session,
    production_order_id: int,
    new_status: str,
    reason: str | None = None,
    user_id: int | None = None,
) -> ProductionOrder:
    production_order = get_production_order(db, production_order_id)
    assert_transition_allowed(ALLOWED_TRANSITIONS, production_order.status, new_status, "production order")
    if new_status == "cancelled":
        assert_reason_given(reason, "A reason is required to cancel a production order.")
        production_order.cancel_reason = reason

    # Explicitly nothing else happens here -- no inventory movement, no
    # stock adjustment, no purchase order, and the customer order itself
    # is left untouched. See docs/production-lifecycle.md's Cancellation
    # section: those integrations belong to the material/execution passes
    # once a Production Order can actually hold a real material or
    # schedule commitment.
    production_order.status = new_status
    production_order.updated_by = user_id
    db.flush()
    audit_service.log_update(db, TABLE_NAME, production_order.id, {"status": (None, new_status)}, user_id)
    db.commit()
    return get_production_order(db, production_order.id)
