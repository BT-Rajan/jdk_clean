from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.core.exceptions import AppError, ConflictError, NotFoundError, ValidationAppError
from app.core.pagination import sort_and_paginate
from app.core.timezone import now_kuwait_naive
from app.core.workflow import assert_reason_given
from app.models.inventory import (
    STOCK_ADJUSTMENT_REQUEST_STATUSES,
    FinishedGoodsInventory,
    RawMaterialInventory,
    StockAdjustmentRequest,
    StockMovement,
)
from app.models.product import Product
from app.models.raw_material import RawMaterial
from app.services import settings_service

_INVENTORY_MODEL = {
    "product": (FinishedGoodsInventory, "product_id", Product),
    "raw_material": (RawMaterialInventory, "raw_material_id", RawMaterial),
}


def _get_or_create_inventory_row(db: Session, item_type: str, item_id: int, for_update: bool = False):
    if item_type not in _INVENTORY_MODEL:
        raise ValidationAppError("item_type must be 'product' or 'raw_material'.")
    inv_model, fk_field, item_model = _INVENTORY_MODEL[item_type]

    item = db.query(item_model).filter(item_model.id == item_id, item_model.deleted_at.is_(None)).first()
    if item is None:
        raise NotFoundError(item_model.__name__)

    query = db.query(inv_model).filter(getattr(inv_model, fk_field) == item_id)
    if for_update:
        query = query.with_for_update()
    row = query.first()

    if row is None:
        row = inv_model(**{fk_field: item_id}, quantity_on_hand=0, quantity_reserved=0)
        db.add(row)
        db.flush()
    return row


def get_stock(db: Session, item_type: str, item_id: int, commit: bool = True) -> dict:
    row = _get_or_create_inventory_row(db, item_type, item_id)
    if commit:
        db.commit()
    return {
        "item_type": item_type,
        "item_id": item_id,
        "quantity_on_hand": float(row.quantity_on_hand),
        "quantity_reserved": float(row.quantity_reserved),
        "quantity_available": float(row.quantity_on_hand) - float(row.quantity_reserved),
    }


def check_availability(db: Session, item_type: str, item_id: int, quantity_needed: float) -> bool:
    row = _get_or_create_inventory_row(db, item_type, item_id)
    db.commit()
    available = float(row.quantity_on_hand) - float(row.quantity_reserved)
    return available >= quantity_needed


def adjust_stock(
    db: Session,
    item_type: str,
    item_id: int,
    quantity: float,
    movement_type: str,
    reference_type: str | None = None,
    reference_id: int | None = None,
    notes: str | None = None,
    user_id: int | None = None,
    supplier_id: int | None = None,
    unit_cost: float | None = None,
    batch_number: str | None = None,
    expiry_date=None,
    invoice_number: str | None = None,
    received_by: str | None = None,
    received_date=None,
    commit: bool = True,
    is_manual: bool = False,
    allow_negative_stock: bool = False,
) -> dict:
    """Apply a signed quantity delta to on-hand stock and record the movement.

    quantity > 0 means stock coming in, quantity < 0 means stock going out.
    Refuses to let on-hand stock go negative, unless allow_negative_stock
    is explicitly set.

    commit=False lets a caller that's already holding a row lock on some
    parent record (an order, PO, batch, delivery note) fold this movement
    into its own single transaction/commit instead of this call committing
    (and releasing that lock) on its own -- see order_service.change_status
    for the pattern this exists for.

    Every raw material physically arriving at the factory must be
    traceable to a supplier, a cost, an invoice/delivery note, who
    received it, and when -- so item_type == 'raw_material' and
    movement_type == 'receipt' requires supplier_id, unit_cost,
    invoice_number, received_by, and received_date. batch_number and
    expiry_date stay optional, since not every raw material is batch or
    expiry tracked. This applies uniformly whether the receipt is logged
    against a purchase order (purchase_order_service.receive_lines fills
    most of these in automatically from the PO) or ad hoc with no PO at
    all (the /inventory/adjust form) -- there's no path for raw material
    stock to increase without this detail attached.

    is_manual (True only from the person-driven /inventory/adjust path,
    via submit_manual_adjustment -- never from an internal service call)
    turns on two extra guards a coordinated multi-step internal
    transaction must NOT be held to, since it manages its own
    reservation release order deliberately (e.g. production_order_
    material_service.consume issues stock *before* releasing the very
    reservation that covered it, in the same commit -- a manual-only
    check here would otherwise misread that in-flight moment as "dipping
    into reserved stock"):
    - `notes` (the reason) is mandatory.
    - Consuming (quantity < 0) is refused if it would leave on-hand
      stock below what's still reserved -- a manual user must not be
      able to silently eat into stock someone else's order/allocation
      is already holding -- unless allow_negative_stock overrides it.
    """
    if item_type not in _INVENTORY_MODEL:
        raise ValidationAppError("item_type must be 'product' or 'raw_material'.")
    if quantity == 0:
        raise ValidationAppError("Quantity must not be zero.")

    if item_type == "raw_material" and movement_type == "receipt":
        missing = [
            name
            for name, value in (
                ("supplier_id", supplier_id),
                ("unit_cost", unit_cost),
                ("invoice_number", invoice_number),
                ("received_by", received_by),
                ("received_date", received_date),
            )
            if value is None
        ]
        if missing:
            raise ValidationAppError(
                "Receiving raw material requires " + ", ".join(missing) + " -- "
                "missing detail here would leave supplier and cost analytics with gaps."
            )

    if is_manual:
        assert_reason_given(notes, "A reason is required for a manual stock adjustment.")

    row = _get_or_create_inventory_row(db, item_type, item_id, for_update=True)

    new_quantity = float(row.quantity_on_hand) + quantity
    if not allow_negative_stock:
        if new_quantity < 0:
            raise AppError(
                f"Insufficient stock: {row.quantity_on_hand} on hand, cannot apply change of {quantity}."
            )
        if is_manual and quantity < 0 and new_quantity < float(row.quantity_reserved):
            raise ConflictError(
                f"This adjustment would leave {round(new_quantity, 4)} on hand against "
                f"{row.quantity_reserved} already reserved -- set allow_negative_stock to override."
            )

    row.quantity_on_hand = new_quantity
    movement = StockMovement(
        item_type=item_type,
        item_id=item_id,
        movement_type=movement_type,
        quantity=quantity,
        reference_type=reference_type,
        reference_id=reference_id,
        supplier_id=supplier_id,
        unit_cost=unit_cost,
        batch_number=batch_number,
        expiry_date=expiry_date,
        invoice_number=invoice_number,
        received_by=received_by,
        received_date=received_date,
        notes=notes,
        created_by=user_id,
    )
    db.add(movement)
    # Flushed regardless of `commit` (never releases the row lock above,
    # unlike an actual commit) so movement.id is always populated -- every
    # caller of adjust_stock can point straight at the ledger entry this
    # call just created (see submit_manual_adjustment/
    # approve_stock_adjustment_request, which need it immediately).
    db.flush()
    if commit:
        db.commit()
    result = get_stock(db, item_type, item_id, commit=commit)
    result["movement_id"] = movement.id
    return result


def _log_reservation_movement(
    db: Session,
    item_type: str,
    item_id: int,
    movement_type: str,
    quantity: float,
    reference_type: str | None,
    reference_id: int | None,
    user_id: int | None,
) -> None:
    """Records a reservation-lifecycle event (movement_type 'reserve' or
    'release') in the same stock_movements ledger every physical stock
    change already goes through -- so "what document created/released
    this reservation" is answered by the ordinary movement history
    (filter by item + reference), not a second, untracked concept.
    Quantity here is the reservation delta, not an on-hand delta -- these
    movements never touch quantity_on_hand."""
    db.add(
        StockMovement(
            item_type=item_type,
            item_id=item_id,
            movement_type=movement_type,
            quantity=quantity,
            reference_type=reference_type,
            reference_id=reference_id,
            created_by=user_id,
        )
    )


def reserve_stock(
    db: Session,
    item_type: str,
    item_id: int,
    quantity: float,
    reference_type: str | None = None,
    reference_id: int | None = None,
    user_id: int | None = None,
    commit: bool = True,
) -> dict:
    """Increases quantity_reserved without touching on-hand stock.

    Used when an order is confirmed: the stock is earmarked for that order
    even if it hasn't shipped (or even been produced) yet. Reservations are
    allowed to exceed on-hand quantity -- a shortfall here is exactly the
    signal the future MRP/feasibility engine will act on, not something to
    silently block at this layer.

    commit=False -- see adjust_stock's docstring.
    """
    if item_type not in _INVENTORY_MODEL:
        raise ValidationAppError("item_type must be 'product' or 'raw_material'.")
    if quantity <= 0:
        raise ValidationAppError("Reservation quantity must be positive.")

    row = _get_or_create_inventory_row(db, item_type, item_id, for_update=True)
    row.quantity_reserved = float(row.quantity_reserved) + quantity
    _log_reservation_movement(db, item_type, item_id, "reserve", quantity, reference_type, reference_id, user_id)
    if commit:
        db.commit()
    return get_stock(db, item_type, item_id, commit=commit)


def reserve_stock_within_available(
    db: Session,
    item_type: str,
    item_id: int,
    quantity: float,
    reference_type: str | None = None,
    reference_id: int | None = None,
    user_id: int | None = None,
    commit: bool = True,
) -> dict:
    """Like reserve_stock, but refuses to reserve beyond what's currently
    available (on-hand minus everything already reserved) -- for callers
    where over-reservation must be impossible, e.g. Production Order
    material allocation (P4), unlike reserve_stock's own deliberately
    permissive stance (order confirmation reserves the full line
    regardless of stock, since a shortfall there is itself a useful
    MRP/feasibility signal, not something to block).

    Locks the row for the whole check-then-update so two concurrent
    callers can never both pass the check against the same stale
    available figure and jointly over-allocate the same physical stock --
    same with_for_update() primitive reserve_stock/adjust_stock already
    use, just with a cap enforced before the write.
    """
    if item_type not in _INVENTORY_MODEL:
        raise ValidationAppError("item_type must be 'product' or 'raw_material'.")
    if quantity <= 0:
        raise ValidationAppError("Allocation quantity must be positive.")

    row = _get_or_create_inventory_row(db, item_type, item_id, for_update=True)
    available = float(row.quantity_on_hand) - float(row.quantity_reserved)
    if quantity > available:
        raise ValidationAppError(
            f"Only {round(available, 4)} available to allocate (requested {quantity})."
        )
    row.quantity_reserved = float(row.quantity_reserved) + quantity
    _log_reservation_movement(db, item_type, item_id, "reserve", quantity, reference_type, reference_id, user_id)
    if commit:
        db.commit()
    return get_stock(db, item_type, item_id, commit=commit)


def release_reservation(
    db: Session,
    item_type: str,
    item_id: int,
    quantity: float,
    reference_type: str | None = None,
    reference_id: int | None = None,
    user_id: int | None = None,
    commit: bool = True,
) -> dict:
    """Decreases quantity_reserved (e.g. order cancelled, or shipped and no
    longer just "reserved"). Clamps at zero rather than going negative in
    case of any prior drift.

    commit=False -- see adjust_stock's docstring.
    """
    if item_type not in _INVENTORY_MODEL:
        raise ValidationAppError("item_type must be 'product' or 'raw_material'.")
    if quantity <= 0:
        raise ValidationAppError("Release quantity must be positive.")

    row = _get_or_create_inventory_row(db, item_type, item_id, for_update=True)
    row.quantity_reserved = max(0.0, float(row.quantity_reserved) - quantity)
    _log_reservation_movement(db, item_type, item_id, "release", quantity, reference_type, reference_id, user_id)
    if commit:
        db.commit()
    return get_stock(db, item_type, item_id, commit=commit)


_FG_SORTABLE_FIELDS = {
    "code": Product.code,
    "name": Product.name,
    "quantity_on_hand": FinishedGoodsInventory.quantity_on_hand,
    "reorder_point": Product.reorder_point,
}


def get_finished_goods_stock(
    db: Session,
    page: int = 1,
    page_size: int = 25,
    search: str | None = None,
    sort: str | None = None,
    low_only: bool = False,
) -> dict:
    """Paginated stock overview across every active finished good/sub-
    assembly -- the list view get_stock() doesn't provide (that one only
    answers "what's on hand for this one product"). A product with no
    FinishedGoodsInventory row yet (nothing has moved for it) still shows
    up, at zero, via the outer join rather than being silently absent.
    """
    query = (
        db.query(Product, FinishedGoodsInventory)
        .outerjoin(FinishedGoodsInventory, FinishedGoodsInventory.product_id == Product.id)
        .filter(Product.deleted_at.is_(None), Product.status == "active")
    )

    if search:
        like = f"%{search}%"
        query = query.filter(or_(Product.code.ilike(like), Product.name.ilike(like)))

    if low_only:
        query = query.filter(func.coalesce(FinishedGoodsInventory.quantity_on_hand, 0) <= Product.reorder_point)

    result = sort_and_paginate(query, Product, _FG_SORTABLE_FIELDS, sort, page, page_size, default_field="name")

    items = []
    for product, inv in result["items"]:
        on_hand = float(inv.quantity_on_hand) if inv else 0.0
        reserved = float(inv.quantity_reserved) if inv else 0.0
        reorder_point = float(product.reorder_point)
        items.append(
            {
                "product_id": product.id,
                "code": product.code,
                "name": product.name,
                "unit": product.unit,
                "product_status": product.status,
                "quantity_on_hand": on_hand,
                "quantity_reserved": reserved,
                "quantity_available": on_hand - reserved,
                "reorder_point": reorder_point,
                "is_low": on_hand <= reorder_point,
            }
        )
    result["items"] = items
    return result


_RM_SORTABLE_FIELDS = {
    "code": RawMaterial.code,
    "name": RawMaterial.name,
    "quantity_on_hand": RawMaterialInventory.quantity_on_hand,
    "reorder_point": RawMaterial.reorder_point,
}


def get_raw_material_stock(
    db: Session,
    page: int = 1,
    page_size: int = 25,
    search: str | None = None,
    sort: str | None = None,
    low_only: bool = False,
    material_type: str | None = None,
) -> dict:
    """Raw material equivalent of get_finished_goods_stock -- on hand,
    reserved, available for every active raw material, with the same
    outer-join-so-nothing-moved-yet-still-shows stance. `material_type`
    ('raw_material' | 'packaging' | 'consumable', see RawMaterial.
    material_type) lets packaging stock be viewed independently from
    ordinary raw material stock instead of always mixed into one list --
    the two are stocked/purchased identically today, but a person
    checking "do we have enough boxes" shouldn't have to eyeball past
    every unrelated raw material to find them.
    """
    query = (
        db.query(RawMaterial, RawMaterialInventory)
        .outerjoin(RawMaterialInventory, RawMaterialInventory.raw_material_id == RawMaterial.id)
        .filter(RawMaterial.deleted_at.is_(None), RawMaterial.status == "active")
    )

    if material_type:
        query = query.filter(RawMaterial.material_type == material_type)

    if search:
        like = f"%{search}%"
        query = query.filter(or_(RawMaterial.code.ilike(like), RawMaterial.name.ilike(like)))

    if low_only:
        query = query.filter(func.coalesce(RawMaterialInventory.quantity_on_hand, 0) <= RawMaterial.reorder_point)

    result = sort_and_paginate(query, RawMaterial, _RM_SORTABLE_FIELDS, sort, page, page_size, default_field="name")

    items = []
    for material, inv in result["items"]:
        on_hand = float(inv.quantity_on_hand) if inv else 0.0
        reserved = float(inv.quantity_reserved) if inv else 0.0
        reorder_point = float(material.reorder_point)
        items.append(
            {
                "raw_material_id": material.id,
                "code": material.code,
                "name": material.name,
                "unit": material.unit,
                "material_type": material.material_type,
                "material_status": material.status,
                "quantity_on_hand": on_hand,
                "quantity_reserved": reserved,
                "quantity_available": on_hand - reserved,
                "reorder_point": reorder_point,
                "is_low": on_hand <= reorder_point,
            }
        )
    result["items"] = items
    return result


def get_low_stock(db: Session) -> list[dict]:
    """Raw materials whose on-hand quantity is at or below their reorder point.

    Finished goods have their own equivalent -- see
    get_finished_goods_stock(low_only=True) below -- kept as a separate
    function/endpoint rather than merged in here since the two item types
    carry different fields (a raw material has no selling price/status
    the way a product does, and vice versa a product has no supplier),
    so a combined response would need to paper over that with nulls.
    """
    rows = (
        db.query(RawMaterial, RawMaterialInventory)
        .join(
            RawMaterialInventory,
            RawMaterialInventory.raw_material_id == RawMaterial.id,
            isouter=True,
        )
        .filter(RawMaterial.deleted_at.is_(None), RawMaterial.status == "active")
        .all()
    )
    low = []
    for material, inv in rows:
        on_hand = float(inv.quantity_on_hand) if inv else 0.0
        if on_hand <= float(material.reorder_point):
            low.append(
                {
                    "raw_material_id": material.id,
                    "code": material.code,
                    "name": material.name,
                    "quantity_on_hand": on_hand,
                    "reorder_point": float(material.reorder_point),
                }
            )
    return low


_MOVEMENT_SORTABLE_FIELDS = {
    "created_at": StockMovement.created_at,
    "quantity": StockMovement.quantity,
    "movement_type": StockMovement.movement_type,
}


def get_movement_history(
    db: Session,
    item_type: str | None = None,
    item_id: int | None = None,
    reference_type: str | None = None,
    reference_id: int | None = None,
    page: int = 1,
    page_size: int = 25,
    sort: str | None = None,
) -> dict:
    query = db.query(StockMovement)
    if item_type:
        query = query.filter(StockMovement.item_type == item_type)
    if item_id:
        query = query.filter(StockMovement.item_id == item_id)
    if reference_type:
        query = query.filter(StockMovement.reference_type == reference_type)
    if reference_id:
        query = query.filter(StockMovement.reference_id == reference_id)

    return sort_and_paginate(
        query, StockMovement, _MOVEMENT_SORTABLE_FIELDS, sort, page, page_size, default_field="created_at"
    )


_ADJUSTMENT_REQUEST_SORTABLE_FIELDS = {
    "requested_at": StockAdjustmentRequest.requested_at,
    "quantity": StockAdjustmentRequest.quantity,
    "status": StockAdjustmentRequest.status,
}


def get_stock_adjustment_request(db: Session, request_id: int) -> StockAdjustmentRequest:
    obj = db.query(StockAdjustmentRequest).filter(StockAdjustmentRequest.id == request_id).first()
    if obj is None:
        raise NotFoundError("Stock adjustment request")
    return obj


def list_stock_adjustment_requests(
    db: Session,
    status: str | None = None,
    page: int = 1,
    page_size: int = 25,
    sort: str | None = None,
) -> dict:
    query = db.query(StockAdjustmentRequest)
    if status:
        if status not in STOCK_ADJUSTMENT_REQUEST_STATUSES:
            raise ValidationAppError(f"status must be one of {', '.join(STOCK_ADJUSTMENT_REQUEST_STATUSES)}.")
        query = query.filter(StockAdjustmentRequest.status == status)
    return sort_and_paginate(
        query,
        StockAdjustmentRequest,
        _ADJUSTMENT_REQUEST_SORTABLE_FIELDS,
        sort,
        page,
        page_size,
        default_field="requested_at",
    )


def submit_manual_adjustment(
    db: Session,
    item_type: str,
    item_id: int,
    quantity: float,
    movement_type: str,
    reason: str,
    user_id: int | None = None,
    supplier_id: int | None = None,
    unit_cost: float | None = None,
    batch_number: str | None = None,
    expiry_date=None,
    invoice_number: str | None = None,
    received_by: str | None = None,
    received_date=None,
) -> dict:
    """The single entry point for a person-driven stock adjustment
    (POST /api/inventory/adjust) -- always requires a reason (P12), and
    holds the adjustment for admin approval instead of applying it
    immediately once |quantity| reaches the configurable large-stock-
    adjustment threshold (settings_service.
    get_large_stock_adjustment_threshold). Below that threshold (or with
    no threshold set), applies immediately through the ordinary
    adjust_stock(is_manual=True, ...) path -- same reserved-stock and
    reason guards apply either way, an over-threshold request just goes
    through them at approval time instead of now (see
    approve_stock_adjustment_request).

    Returns {"status": "applied", "stock": {...}, "request": None} or
    {"status": "pending_approval", "stock": None, "request": StockAdjustmentRequest}.
    """
    assert_reason_given(reason, "A reason is required for a manual stock adjustment.")

    threshold = settings_service.get_large_stock_adjustment_threshold(db)
    if threshold is not None and abs(quantity) >= threshold:
        request = StockAdjustmentRequest(
            item_type=item_type,
            item_id=item_id,
            quantity=quantity,
            movement_type=movement_type,
            reason=reason,
            supplier_id=supplier_id,
            unit_cost=unit_cost,
            batch_number=batch_number,
            expiry_date=expiry_date,
            invoice_number=invoice_number,
            received_by=received_by,
            received_date=received_date,
            requested_by=user_id,
        )
        db.add(request)
        db.commit()
        db.refresh(request)
        return {"status": "pending_approval", "stock": None, "request": request}

    stock = adjust_stock(
        db,
        item_type=item_type,
        item_id=item_id,
        quantity=quantity,
        movement_type=movement_type,
        notes=reason,
        user_id=user_id,
        supplier_id=supplier_id,
        unit_cost=unit_cost,
        batch_number=batch_number,
        expiry_date=expiry_date,
        invoice_number=invoice_number,
        received_by=received_by,
        received_date=received_date,
        is_manual=True,
    )
    return {"status": "applied", "stock": stock, "request": None}


def approve_stock_adjustment_request(
    db: Session, request_id: int, user_id: int | None = None
) -> StockAdjustmentRequest:
    """Admin approval applies the adjustment immediately, through the
    exact same adjust_stock(is_manual=True, ...) a below-threshold
    adjustment already goes through -- approval isn't a separate, less-
    guarded code path. Locks the request row so it can only ever be
    decided once."""
    request = (
        db.query(StockAdjustmentRequest).filter(StockAdjustmentRequest.id == request_id).with_for_update().first()
    )
    if request is None:
        raise NotFoundError("Stock adjustment request")
    if request.status != "pending":
        raise ConflictError(f"Only a pending request can be approved; this one is '{request.status}'.")

    stock = adjust_stock(
        db,
        item_type=request.item_type,
        item_id=request.item_id,
        quantity=float(request.quantity),
        movement_type=request.movement_type,
        notes=request.reason,
        user_id=request.requested_by,
        supplier_id=request.supplier_id,
        unit_cost=float(request.unit_cost) if request.unit_cost is not None else None,
        batch_number=request.batch_number,
        expiry_date=request.expiry_date,
        invoice_number=request.invoice_number,
        received_by=request.received_by,
        received_date=request.received_date,
        is_manual=True,
        commit=False,
    )

    request.status = "applied"
    request.resulting_movement_id = stock["movement_id"]
    request.decided_by = user_id
    request.decided_at = now_kuwait_naive()
    db.commit()
    db.refresh(request)
    return request


def reject_stock_adjustment_request(
    db: Session, request_id: int, reason: str, user_id: int | None = None
) -> StockAdjustmentRequest:
    request = (
        db.query(StockAdjustmentRequest).filter(StockAdjustmentRequest.id == request_id).with_for_update().first()
    )
    if request is None:
        raise NotFoundError("Stock adjustment request")
    if request.status != "pending":
        raise ConflictError(f"Only a pending request can be rejected; this one is '{request.status}'.")
    assert_reason_given(reason, "A reason is required to reject a stock adjustment request.")

    request.status = "rejected"
    request.rejection_reason = reason
    request.decided_by = user_id
    request.decided_at = now_kuwait_naive()
    db.commit()
    db.refresh(request)
    return request
