from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.core.exceptions import AppError, NotFoundError, ValidationAppError
from app.core.pagination import sort_and_paginate
from app.models.delivery_note import DeliveryNote
from app.models.inventory import FinishedGoodsInventory, RawMaterialInventory, StockMovement
from app.models.order import Order
from app.models.product import Product
from app.models.production_execution import ProductionExecution
from app.models.production_schedule import ProductionSchedule
from app.models.purchase_order import PurchaseOrder
from app.models.qc_request import QcRequest
from app.models.raw_material import RawMaterial
from app.models.supplier_return import SupplierReturn

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
) -> dict:
    """Apply a signed quantity delta to on-hand stock and record the movement.

    quantity > 0 means stock coming in, quantity < 0 means stock going out.
    Refuses to let on-hand stock go negative.

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

    row = _get_or_create_inventory_row(db, item_type, item_id, for_update=True)

    new_quantity = float(row.quantity_on_hand) + quantity
    if new_quantity < 0:
        raise AppError(
            f"Insufficient stock: {row.quantity_on_hand} on hand, cannot apply change of {quantity}."
        )

    row.quantity_on_hand = new_quantity
    db.add(
        StockMovement(
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
    )
    if commit:
        db.commit()
    return get_stock(db, item_type, item_id, commit=commit)


def reserve_stock(db: Session, item_type: str, item_id: int, quantity: float, commit: bool = True) -> dict:
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
    if commit:
        db.commit()
    return get_stock(db, item_type, item_id, commit=commit)


def reserve_stock_within_available(
    db: Session, item_type: str, item_id: int, quantity: float, commit: bool = True
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
    if commit:
        db.commit()
    return get_stock(db, item_type, item_id, commit=commit)


def release_reservation(db: Session, item_type: str, item_id: int, quantity: float, commit: bool = True) -> dict:
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
) -> dict:
    """Paginated stock overview across every active raw material -- the
    counterpart to get_finished_goods_stock() below, which only raw
    materials have lacked until now (get_low_stock() only ever returns
    the at/below-reorder-point subset, never the full list). Same
    outer-join-so-zero-stock-still-shows pattern.
    """
    query = (
        db.query(RawMaterial, RawMaterialInventory)
        .outerjoin(RawMaterialInventory, RawMaterialInventory.raw_material_id == RawMaterial.id)
        .filter(RawMaterial.deleted_at.is_(None), RawMaterial.status == "active")
    )

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

# reference_type -> (model, number/label field, route template). Direct
# single-table lookups by id; production_execution/qc_request are handled
# separately below since resolving them to something a user recognizes
# means following their own production_order_id through to the owning
# Production Order, not just naming the execution/QC row itself.
_REFERENCE_LOOKUPS = {
    "purchase_order": (PurchaseOrder, "po_number", "/purchase-orders/{id}"),
    "supplier_return": (SupplierReturn, "return_number", "/supplier-returns/{id}"),
    "order": (Order, "order_number", "/orders/{id}"),
    "delivery_note": (DeliveryNote, "delivery_note_number", "/delivery-notes/{id}"),
    "production_schedule": (ProductionSchedule, "batch_number", "/production/{id}"),
}


def _resolve_references(db: Session, movements: list[StockMovement]) -> dict[tuple[str, int], dict]:
    """Batch-resolves each distinct (reference_type, reference_id) pair on
    this page of movements into a human label + frontend route, the same
    "collect ids up front, look them up in a couple of grouped queries"
    approach report_service.get_inventory_drilldown already uses for item
    names -- at most one extra query per reference_type actually present
    on the page, never one query per row.
    """
    resolved: dict[tuple[str, int], dict] = {}

    ids_by_type: dict[str, set[int]] = {}
    for m in movements:
        if m.reference_type and m.reference_id:
            ids_by_type.setdefault(m.reference_type, set()).add(m.reference_id)

    for ref_type, ids in ids_by_type.items():
        if ref_type in _REFERENCE_LOOKUPS:
            model, label_field, route_template = _REFERENCE_LOOKUPS[ref_type]
            rows = db.query(model).filter(model.id.in_(ids)).all()
            for row in rows:
                resolved[(ref_type, row.id)] = {
                    "reference_label": getattr(row, label_field),
                    "reference_route": route_template.format(id=row.id),
                }
        elif ref_type in ("production_execution", "qc_request"):
            model = ProductionExecution if ref_type == "production_execution" else QcRequest
            rows = db.query(model).filter(model.id.in_(ids)).all()
            for row in rows:
                po = row.production_order
                resolved[(ref_type, row.id)] = {
                    "reference_label": po.production_order_number if po else None,
                    "reference_route": f"/production-orders/{po.id}" if po else None,
                }

    return resolved


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

    result = sort_and_paginate(
        query, StockMovement, _MOVEMENT_SORTABLE_FIELDS, sort, page, page_size, default_field="created_at"
    )

    movements: list[StockMovement] = result["items"]

    # Same batching for item name/route as report_service's drilldown:
    # collect this page's ids per item_type, resolve each type in one
    # query rather than one query per row.
    raw_material_ids = {m.item_id for m in movements if m.item_type == "raw_material"}
    product_ids = {m.item_id for m in movements if m.item_type == "product"}
    raw_material_names = (
        {r.id: r.name for r in db.query(RawMaterial).filter(RawMaterial.id.in_(raw_material_ids)).all()}
        if raw_material_ids
        else {}
    )
    product_names = (
        {p.id: p.name for p in db.query(Product).filter(Product.id.in_(product_ids)).all()} if product_ids else {}
    )
    references = _resolve_references(db, movements)

    items = []
    for m in movements:
        if m.item_type == "raw_material":
            item_name = raw_material_names.get(m.item_id)
            item_route = f"/raw-materials/{m.item_id}" if m.item_id in raw_material_names else None
        else:
            item_name = product_names.get(m.item_id)
            item_route = f"/products/{m.item_id}" if m.item_id in product_names else None

        ref = references.get((m.reference_type, m.reference_id)) if m.reference_type and m.reference_id else None

        items.append(
            {
                "id": m.id,
                "item_type": m.item_type,
                "item_id": m.item_id,
                "item_name": item_name,
                "item_route": item_route,
                "movement_type": m.movement_type,
                "quantity": float(m.quantity),
                "reference_type": m.reference_type,
                "reference_id": m.reference_id,
                "reference_label": ref["reference_label"] if ref else None,
                "reference_route": ref["reference_route"] if ref else None,
                "supplier_id": m.supplier_id,
                "unit_cost": float(m.unit_cost) if m.unit_cost is not None else None,
                "batch_number": m.batch_number,
                "expiry_date": m.expiry_date,
                "invoice_number": m.invoice_number,
                "received_by": m.received_by,
                "received_date": m.received_date,
                "notes": m.notes,
                "created_at": m.created_at,
                "created_by": m.created_by,
            }
        )
    result["items"] = items
    return result
