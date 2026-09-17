from sqlalchemy.orm import Session, joinedload

from app.core.exceptions import ConflictError, NotFoundError, ValidationAppError
from app.core.pagination import sort_and_paginate
from app.core.workflow import assert_reason_given, assert_transition_allowed
from app.models.order import Order, OrderDetail
from app.models.product import Product
from app.models.production_execution import ProductionExecution
from app.models.production_order import ALLOWED_TRANSITIONS, ELIGIBLE_ORDER_STATUSES, ProductionOrder
from app.models.production_schedule import ProductionSchedule
from app.services import audit_service, deal_service, number_series_service

TABLE_NAME = "production_orders"


def _base_query(db: Session):
    return db.query(ProductionOrder).options(
        joinedload(ProductionOrder.order).joinedload(Order.customer),
        joinedload(ProductionOrder.order_detail),
        joinedload(ProductionOrder.product),
    )


def get_production_order(db: Session, production_order_id: int, for_update: bool = False) -> ProductionOrder:
    if for_update:
        # A plain, unjoined lock query -- see order_service.get_order's
        # own for_update branch for why _base_query's joinedloads can't
        # be combined with with_for_update().
        obj = (
            db.query(ProductionOrder)
            .filter(ProductionOrder.id == production_order_id)
            .with_for_update()
            .first()
        )
    else:
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


def _get_active_product(db: Session, product_id: int) -> Product:
    product = db.query(Product).filter(Product.id == product_id, Product.deleted_at.is_(None)).first()
    if product is None:
        raise ValidationAppError(f"Product {product_id} not found.")
    if product.status != "active":
        raise ValidationAppError(f"{product.name} is inactive and cannot be planned for production.")
    return product


def create_production_order(db: Session, data: dict, user_id: int | None = None) -> ProductionOrder:
    """Two independent paths (P8 -- see models/production_order.py's own
    docstring on why order_detail_id is now optional):

    - order_detail_id given: exactly the original P2 behavior -- raised
      against a specific, still-open customer order line, capped at
      whatever that line has yet to commit to production.
    - order_detail_id omitted: a stock-only Production Order, raised
      directly against `product_id` to build/replenish general Finished
      Goods inventory with no customer order behind it at all. No order-
      status or committed-quantity gate applies -- there's no order line
      to check either against.
    """
    if data.get("order_detail_id"):
        return _create_order_linked_production_order(db, data, user_id)
    return _create_stock_production_order(db, data, user_id)


def _create_order_linked_production_order(db: Session, data: dict, user_id: int | None = None) -> ProductionOrder:
    """Transactional: locks the order line for the duration of this check
    + insert so two concurrent requests against the same line can never
    both succeed past the remaining-quantity check -- the second waits for
    the first's row lock, then re-reads the now-updated commitment total.
    Same with_for_update() pattern order_service/production_service
    already use for their own quantity-affecting writes.
    """
    # Locked for the rest of this call -- see docstring above.
    order_detail = (
        db.query(OrderDetail)
        .filter(OrderDetail.id == data["order_detail_id"])
        .with_for_update()
        .first()
    )
    if order_detail is None:
        raise ValidationAppError("This order line does not exist.")

    order = db.query(Order).filter(Order.id == order_detail.order_id, Order.deleted_at.is_(None)).first()
    if order is None:
        raise NotFoundError("Order")
    if order.status not in ELIGIBLE_ORDER_STATUSES:
        raise ConflictError(
            f"Cannot create a production order from an order in '{order.status}' status; "
            f"the order must be confirmed and still open."
        )

    product = _get_active_product(db, order_detail.product_id)

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


def _create_stock_production_order(db: Session, data: dict, user_id: int | None = None) -> ProductionOrder:
    """Builds/replenishes general Finished Goods stock -- no customer
    order, no order-status gate, no committed-quantity cap (there's no
    order line to cap against). See create_production_order's docstring."""
    product_id = data.get("product_id")
    if not product_id:
        raise ValidationAppError("Either order_detail_id or product_id is required.")
    product = _get_active_product(db, product_id)

    production_order_number = number_series_service.next_number(db, "PRODUCTION_ORDER")
    production_order = ProductionOrder(
        production_order_number=production_order_number,
        order_id=None,
        order_detail_id=None,
        product_id=product.id,
        planned_quantity=float(data["planned_quantity"]),
        due_date=data["due_date"],
        priority=data.get("priority") or "normal",
        notes=data.get("notes"),
        created_by=user_id,
    )
    db.add(production_order)
    db.flush()
    audit_service.log_create(db, TABLE_NAME, production_order.id, user_id)
    db.commit()
    return get_production_order(db, production_order.id)


def get_pipeline_quantity(db: Session, product_id: int) -> dict:
    """How much of `product_id` is already somewhere in the production
    pipeline and not yet produced, split into 'planned' (not started)
    and 'in_progress' (machine time actually running) -- across both
    legitimate ways this app schedules production: the Production Order
    chain (P2/P5/P6) and the older auto-scheduled batch flow (see
    models/production_schedule.py's own note on production_order_id
    being NULL for it). A Customer Order's shortage calculation
    (order_service.get_fulfillment) nets this off so it never suggests
    replenishing output that's already queued up in either pipeline --
    P8 spec section 10.

    Never counted as available FG -- that's strictly
    FinishedGoodsInventory.quantity_on_hand, populated only by an
    accepted QC release (see qc_service._release_execution_fg). This is
    visibility for planning, not stock.
    """
    planned = 0.0
    in_progress = 0.0

    production_orders = (
        db.query(ProductionOrder.id, ProductionOrder.planned_quantity)
        .filter(ProductionOrder.product_id == product_id, ProductionOrder.status == "planned")
        .all()
    )
    for po_id, po_planned_quantity in production_orders:
        executions = (
            db.query(
                ProductionExecution.status,
                ProductionExecution.planned_quantity,
                ProductionExecution.produced_quantity,
            )
            .filter(ProductionExecution.production_order_id == po_id, ProductionExecution.status != "cancelled")
            .all()
        )
        completed = sum(float(e.produced_quantity) for e in executions if e.status == "completed")
        in_progress_planned = sum(float(e.planned_quantity) for e in executions if e.status == "in_progress")
        in_progress += in_progress_planned
        remaining = round(float(po_planned_quantity) - completed - in_progress_planned, 4)
        if remaining > 0:
            planned += remaining

    legacy_batches = (
        db.query(
            ProductionSchedule.status,
            ProductionSchedule.planned_quantity,
            ProductionSchedule.produced_quantity,
        )
        .filter(
            ProductionSchedule.product_id == product_id,
            ProductionSchedule.production_order_id.is_(None),
            ProductionSchedule.deleted_at.is_(None),
            ProductionSchedule.status.in_(("planned", "in_progress", "paused")),
        )
        .all()
    )
    for status, batch_planned, batch_produced in legacy_batches:
        remaining = max(round(float(batch_planned) - float(batch_produced), 4), 0.0)
        if remaining <= 0:
            continue
        if status == "planned":
            planned += remaining
        else:
            in_progress += remaining

    return {"planned_quantity": round(planned, 4), "in_progress_quantity": round(in_progress, 4)}


def change_status(
    db: Session,
    production_order_id: int,
    new_status: str,
    reason: str | None = None,
    user_id: int | None = None,
) -> ProductionOrder:
    # Locked for the whole call (P10): without this, a concurrent
    # allocate() could slip its own lock on this same row in between this
    # function's read and its final write, allocating fresh material to
    # an order that's about to be cancelled -- exactly the kind of "hidden
    # reservation" Test 12 checks for. allocate()'s own status check
    # (_lock_production_order_status) now correctly blocks on this lock
    # until this transaction commits, instead of racing ahead of it.
    production_order = get_production_order(db, production_order_id, for_update=True)
    assert_transition_allowed(ALLOWED_TRANSITIONS, production_order.status, new_status, "production order")
    if new_status == "cancelled":
        assert_reason_given(reason, "A reason is required to cancel a production order.")
        production_order.cancel_reason = reason

        # P10 spec section 8/Test 12: a cancelled Production Order must
        # not leave a hidden reservation behind -- release whatever
        # material is still allocated and unconsumed on every one of its
        # requirement rows, through the exact same release() primitive a
        # person would otherwise have to call by hand afterward. Already-
        # consumed material is untouched (release() itself refuses to
        # release more than allocated-minus-consumed) -- it's genuinely
        # gone, cancellation doesn't reverse physical consumption.
        # Local import: production_order_material_service doesn't import
        # this module, so this is safe, but keeping it local matches this
        # file's own existing cross-service-call convention.
        from app.services import production_order_material_service

        for requirement in production_order_material_service.get_requirements(db, production_order_id):
            remaining_allocated = round(float(requirement.allocated_quantity) - float(requirement.consumed_quantity), 4)
            if remaining_allocated > 0:
                production_order_material_service.release(
                    db, production_order_id, requirement.id, remaining_allocated, user_id=user_id, commit=False
                )

    production_order.status = new_status
    production_order.updated_by = user_id
    db.flush()
    audit_service.log_update(db, TABLE_NAME, production_order.id, {"status": (None, new_status)}, user_id)
    db.commit()
    return get_production_order(db, production_order.id)
