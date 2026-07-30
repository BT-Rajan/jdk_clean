from datetime import datetime, timezone

from sqlalchemy.orm import Session, joinedload

from app.core.exceptions import AppError, ConflictError, NotFoundError, ValidationAppError
from app.core.pagination import sort_and_paginate
from app.core.workflow import assert_reason_given, assert_transition_allowed
from app.models.order import Order
from app.models.product import Product
from app.models.production_schedule import ALLOWED_TRANSITIONS, ProductionSchedule
from app.models.raw_material import RawMaterial
from app.services import audit_service, bom_service, deal_service, inventory_service, number_series_service

TABLE_NAME = "production_schedules"


def _base_query(db: Session, include_deleted: bool = False):
    query = db.query(ProductionSchedule).options(
        joinedload(ProductionSchedule.product),
        joinedload(ProductionSchedule.machine),
        joinedload(ProductionSchedule.order),
    )
    if not include_deleted:
        query = query.filter(ProductionSchedule.deleted_at.is_(None))
    return query


def get_batch(db: Session, batch_id: int, include_deleted: bool = False) -> ProductionSchedule:
    obj = _base_query(db, include_deleted).filter(ProductionSchedule.id == batch_id).first()
    if obj is None:
        raise NotFoundError("Production batch")
    return obj


_SORTABLE_FIELDS = {
    "batch_number": ProductionSchedule.batch_number,
    "scheduled_start": ProductionSchedule.scheduled_start,
    "scheduled_end": ProductionSchedule.scheduled_end,
    "status": ProductionSchedule.status,
    "created_at": ProductionSchedule.created_at,
}


def list_batches(
    db: Session,
    page: int = 1,
    page_size: int = 10,
    search: str | None = None,
    status: str | None = None,
    product_id: int | None = None,
    order_id: int | None = None,
    sort: str | None = None,
) -> dict:
    query = _base_query(db)

    if status:
        query = query.filter(ProductionSchedule.status == status)
    if product_id:
        query = query.filter(ProductionSchedule.product_id == product_id)
    if order_id:
        query = query.filter(ProductionSchedule.order_id == order_id)
    if search:
        query = query.filter(ProductionSchedule.batch_number.ilike(f"%{search}%"))

    return sort_and_paginate(query, ProductionSchedule, _SORTABLE_FIELDS, sort, page, page_size)


def _validate_product(db: Session, product_id: int) -> Product:
    product = (
        db.query(Product).filter(Product.id == product_id, Product.deleted_at.is_(None)).first()
    )
    if product is None:
        raise ValidationAppError(f"Product {product_id} not found.")
    return product


def _validate_order(db: Session, order_id: int) -> Order:
    order = db.query(Order).filter(Order.id == order_id, Order.deleted_at.is_(None)).first()
    if order is None:
        raise ValidationAppError(f"Order {order_id} not found.")
    return order


def create_batch(db: Session, data: dict, user_id: int | None = None) -> ProductionSchedule:
    product = _validate_product(db, data["product_id"])
    order = None
    if data.get("order_id"):
        order = _validate_order(db, data["order_id"])
    if not data.get("machine_id"):
        data["machine_id"] = product.machine_id

    batch_number = number_series_service.next_number(db, "PRODUCTION_BATCH")
    batch = ProductionSchedule(batch_number=batch_number, created_by=user_id, **data)
    db.add(batch)
    db.flush()
    audit_service.log_create(db, TABLE_NAME, batch.id, user_id)
    if order is not None:
        deal_service.advance_stage(db, order.deal_id, "production", user_id=user_id)
    db.commit()
    db.refresh(batch)
    return get_batch(db, batch.id)


def update_batch(db: Session, batch_id: int, data: dict, user_id: int | None = None) -> ProductionSchedule:
    batch = get_batch(db, batch_id)
    if batch.status != "planned":
        raise ConflictError("Only planned batches can be edited; cancel and recreate instead.")

    if "order_id" in data and data["order_id"]:
        _validate_order(db, data["order_id"])

    changes: dict[str, tuple] = {}
    for field, new_value in data.items():
        old_value = getattr(batch, field)
        if old_value != new_value:
            changes[field] = (old_value, new_value)
            setattr(batch, field, new_value)
    batch.updated_by = user_id

    audit_service.log_update(db, TABLE_NAME, batch_id, changes, user_id)
    db.commit()
    db.refresh(batch)
    return get_batch(db, batch_id)


def delete_batch(db: Session, batch_id: int, user_id: int | None = None) -> None:
    batch = get_batch(db, batch_id)
    if batch.status != "planned":
        raise ConflictError("Only planned batches can be deleted; cancel started batches instead.")
    batch.deleted_at = datetime.now(timezone.utc)
    audit_service.log_delete(db, TABLE_NAME, batch_id, user_id)
    db.commit()


def restore_batch(db: Session, batch_id: int, user_id: int | None = None) -> ProductionSchedule:
    batch = get_batch(db, batch_id, include_deleted=True)
    batch.deleted_at = None
    audit_service.log_restore(db, TABLE_NAME, batch_id, user_id)
    db.commit()
    return get_batch(db, batch_id)


def _start_batch(db: Session, batch: ProductionSchedule, user_id: int | None) -> None:
    batch.actual_start = datetime.now(timezone.utc)
    # If this batch is fulfilling a confirmed order, starting production is
    # exactly what should move the order from 'confirmed' to
    # 'in_production' -- previously that transition existed on Order but
    # had nothing driving it (see order_service.change_status's comment
    # about stock side-effects "kept simple until the MRP/feasibility
    # engine exists"). Imported locally to avoid a circular import, same
    # pattern order_service uses for quotation_service.
    if batch.order_id and batch.order.status == "confirmed":
        from app.services import order_service

        order_service.change_status(db, batch.order_id, "in_production", user_id=user_id)


def _complete_batch(
    db: Session, batch: ProductionSchedule, produced_quantity: float, user_id: int | None
) -> None:
    requirements = bom_service.explode_requirements(db, batch.product_id, produced_quantity)

    # Check every required material is available before touching any stock.
    # adjust_stock() commits per call, so issuing materials one at a time
    # in a loop and discovering a shortfall partway through would leave
    # some materials already deducted -- this pre-check is what keeps
    # completion effectively all-or-nothing instead.
    if requirements:
        materials = {
            m.id: m
            for m in db.query(RawMaterial)
            .filter(RawMaterial.id.in_(requirements.keys()))
            .all()
        }
        shortfalls = []
        for raw_material_id, required_qty in requirements.items():
            stock = inventory_service.get_stock(db, "raw_material", raw_material_id)
            available = stock["quantity_on_hand"]
            if available < required_qty:
                material = materials.get(raw_material_id)
                label = material.name if material else f"#{raw_material_id}"
                shortfalls.append(f"{label} (need {required_qty:.4f}, have {available:.4f})")
        if shortfalls:
            raise AppError(
                "Not enough raw material on hand to complete this batch: " + "; ".join(shortfalls)
            )

    for raw_material_id, required_qty in requirements.items():
        inventory_service.adjust_stock(
            db,
            item_type="raw_material",
            item_id=raw_material_id,
            quantity=-required_qty,
            movement_type="issue",
            reference_type="production_schedule",
            reference_id=batch.id,
            notes=f"Consumed by batch {batch.batch_number}",
            user_id=user_id,
        )

    inventory_service.adjust_stock(
        db,
        item_type="product",
        item_id=batch.product_id,
        quantity=produced_quantity,
        movement_type="receipt",
        reference_type="production_schedule",
        reference_id=batch.id,
        notes=f"Produced by batch {batch.batch_number}",
        user_id=user_id,
    )

    batch.produced_quantity = produced_quantity
    batch.actual_end = datetime.now(timezone.utc)


def change_status(
    db: Session,
    batch_id: int,
    new_status: str,
    produced_quantity: float | None = None,
    reason: str | None = None,
    user_id: int | None = None,
) -> ProductionSchedule:
    batch = get_batch(db, batch_id)
    assert_transition_allowed(ALLOWED_TRANSITIONS, batch.status, new_status, "production batch")

    if new_status == "in_progress":
        _start_batch(db, batch, user_id)
    elif new_status == "completed":
        if not produced_quantity:
            raise ValidationAppError("produced_quantity is required to complete a batch.")
        _complete_batch(db, batch, produced_quantity, user_id)
    elif new_status == "cancelled":
        assert_reason_given(reason, "A reason is required to cancel a production batch.")
        batch.cancel_reason = reason

    old_status = batch.status
    batch.status = new_status
    batch.updated_by = user_id
    audit_service.log_update(
        db, TABLE_NAME, batch_id, {"status": (old_status, new_status)}, user_id
    )
    db.commit()
    db.refresh(batch)

    if new_status == "completed":
        _maybe_advance_order_to_ready_to_ship(db, batch.order_id, user_id)

    return get_batch(db, batch_id)


def _maybe_advance_order_to_ready_to_ship(db: Session, order_id: int | None, user_id: int | None) -> None:
    """The symmetric close of _start_batch's order -> 'in_production' hook
    above: once every (non-cancelled) production batch tied to an order
    has completed, the order genuinely is ready to ship -- advance it
    automatically rather than leaving a person to notice and do it by
    hand. Unlike the auto-create hooks elsewhere in this pipeline, this
    one has no settings toggle: it's not creating a new record on a
    judgement call, just recognizing a status that's already objectively
    true (same as _start_batch's hook, which has always been
    unconditional). Never raises -- best-effort, same as every other
    auto-progression hook.
    """
    if order_id is None:
        return
    order = db.query(Order).filter(Order.id == order_id, Order.deleted_at.is_(None)).first()
    if order is None or order.status != "in_production":
        return

    batches = (
        db.query(ProductionSchedule)
        .filter(ProductionSchedule.order_id == order_id, ProductionSchedule.deleted_at.is_(None))
        .all()
    )
    if any(b.status not in ("completed", "cancelled") for b in batches):
        return  # still waiting on at least one batch
    if not any(b.status == "completed" for b in batches):
        return  # every batch was cancelled -- nothing was actually produced

    from app.services import order_service

    try:
        order_service.change_status(db, order_id, "ready_to_ship", user_id=user_id)
    except (ConflictError, ValidationAppError):
        pass
