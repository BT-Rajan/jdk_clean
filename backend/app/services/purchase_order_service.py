from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session, joinedload

from app.core.exceptions import ConflictError, NotFoundError, ValidationAppError
from app.core.pagination import sort_and_paginate
from app.models.purchase_order import ALLOWED_TRANSITIONS, PurchaseOrder, PurchaseOrderLine
from app.models.raw_material import RawMaterial
from app.models.supplier import Supplier
from app.services import audit_service, inventory_service, number_series_service

TABLE_NAME = "purchase_orders"


def _price_lines(db: Session, lines: list[dict]) -> list[dict]:
    priced: list[dict] = []
    for line in lines:
        material = (
            db.query(RawMaterial)
            .filter(RawMaterial.id == line["raw_material_id"], RawMaterial.deleted_at.is_(None))
            .first()
        )
        if material is None:
            raise ValidationAppError(f"Raw material {line['raw_material_id']} not found.")
        line_total = round(float(line["quantity"]) * float(line["unit_price"]), 2)
        priced.append({**line, "line_total": line_total})
    return priced


def _base_query(db: Session, include_deleted: bool = False):
    query = db.query(PurchaseOrder).options(
        joinedload(PurchaseOrder.supplier),
        joinedload(PurchaseOrder.lines).joinedload(PurchaseOrderLine.raw_material),
    )
    if not include_deleted:
        query = query.filter(PurchaseOrder.deleted_at.is_(None))
    return query


def get_purchase_order(db: Session, po_id: int, include_deleted: bool = False) -> PurchaseOrder:
    obj = _base_query(db, include_deleted).filter(PurchaseOrder.id == po_id).first()
    if obj is None:
        raise NotFoundError("Purchase order")
    return obj


_PO_SORTABLE_FIELDS = {
    "po_number": PurchaseOrder.po_number,
    "order_date": PurchaseOrder.order_date,
    "total_amount": PurchaseOrder.total_amount,
    "status": PurchaseOrder.status,
    "created_at": PurchaseOrder.created_at,
}


def list_purchase_orders(
    db: Session,
    page: int = 1,
    page_size: int = 10,
    search: str | None = None,
    status: str | None = None,
    supplier_id: int | None = None,
    sort: str | None = None,
) -> dict:
    query = _base_query(db)

    if status:
        query = query.filter(PurchaseOrder.status == status)
    if supplier_id:
        query = query.filter(PurchaseOrder.supplier_id == supplier_id)
    if search:
        like = f"%{search}%"
        query = query.join(Supplier).filter(
            (PurchaseOrder.po_number.ilike(like)) | (Supplier.name.ilike(like))
        )

    return sort_and_paginate(query, PurchaseOrder, _PO_SORTABLE_FIELDS, sort, page, page_size)


def _validate_supplier(db: Session, supplier_id: int) -> Supplier:
    supplier = (
        db.query(Supplier)
        .filter(Supplier.id == supplier_id, Supplier.deleted_at.is_(None))
        .first()
    )
    if supplier is None:
        raise ValidationAppError(f"Supplier {supplier_id} not found.")
    return supplier


def create_purchase_order(db: Session, data: dict, user_id: int | None = None) -> PurchaseOrder:
    _validate_supplier(db, data["supplier_id"])

    lines = _price_lines(db, [dict(line) for line in data.pop("lines")])
    total_amount = round(sum(line["line_total"] for line in lines), 2)

    po_number = number_series_service.next_number(db, "PURCHASE_ORDER")

    po = PurchaseOrder(po_number=po_number, total_amount=total_amount, created_by=user_id, **data)
    po.lines = [PurchaseOrderLine(**line) for line in lines]

    db.add(po)
    db.flush()
    audit_service.log_create(db, TABLE_NAME, po.id, user_id)
    db.commit()
    db.refresh(po)
    return get_purchase_order(db, po.id)


def update_purchase_order(
    db: Session, po_id: int, data: dict, user_id: int | None = None
) -> PurchaseOrder:
    po = get_purchase_order(db, po_id)
    if po.status != "draft":
        raise ConflictError("Only draft purchase orders can be edited.")

    changes: dict[str, tuple[Any, Any]] = {}

    if "supplier_id" in data and data["supplier_id"] is not None:
        _validate_supplier(db, data["supplier_id"])

    lines = data.pop("lines", None)
    if data.get("supplier_id") is None:
        data.pop("supplier_id", None)

    for field, new_value in data.items():
        old_value = getattr(po, field)
        if old_value != new_value:
            changes[field] = (old_value, new_value)
            setattr(po, field, new_value)

    if lines is not None:
        priced = _price_lines(db, [dict(line) for line in lines])
        po.lines.clear()
        db.flush()
        po.lines = [PurchaseOrderLine(**line) for line in priced]
        po.total_amount = round(sum(line["line_total"] for line in priced), 2)
        changes["lines"] = ("(previous lines)", "(updated lines)")

    po.updated_by = user_id
    audit_service.log_update(db, TABLE_NAME, po_id, changes, user_id)
    db.commit()
    return get_purchase_order(db, po_id)


def change_status(db: Session, po_id: int, new_status: str, user_id: int | None = None) -> PurchaseOrder:
    """Handles the plain transitions (draft->sent->confirmed, and
    cancelling). Receiving goods is deliberately NOT one of these -- it
    needs per-line quantities, so it's its own action (receive_lines)."""
    po = get_purchase_order(db, po_id)
    allowed = ALLOWED_TRANSITIONS.get(po.status, set())
    if new_status not in allowed:
        raise ConflictError(f"Cannot move purchase order from '{po.status}' to '{new_status}'.")

    old_status = po.status
    po.status = new_status
    po.updated_by = user_id
    audit_service.log_update(db, TABLE_NAME, po_id, {"status": (old_status, new_status)}, user_id)
    db.commit()
    return get_purchase_order(db, po_id)


def receive_lines(
    db: Session, po_id: int, receipts: list[dict], user_id: int | None = None
) -> PurchaseOrder:
    """Records goods received against one or more lines -- possibly
    partial, possibly spread across several calls as deliveries arrive
    over time. Each receipt increases raw material stock on hand and the
    line's received_quantity; the PO's overall status is recomputed from
    the lines afterward rather than being something the caller sets
    directly.
    """
    po = get_purchase_order(db, po_id)
    if po.status not in ("confirmed", "partially_received"):
        raise ConflictError(
            f"Cannot receive goods against a purchase order in '{po.status}' status; "
            "it must be confirmed first."
        )

    lines_by_id = {line.id: line for line in po.lines}

    # Validate every receipt before applying any of them, so a bad line in
    # the batch doesn't leave earlier ones already applied (adjust_stock
    # commits per call -- see production_service.py's _complete_batch for
    # the same reasoning).
    for receipt in receipts:
        line = lines_by_id.get(receipt["line_id"])
        if line is None:
            raise ValidationAppError(f"Line {receipt['line_id']} does not belong to this purchase order.")
        remaining = float(line.quantity) - float(line.received_quantity)
        if receipt["quantity"] > remaining:
            raise ValidationAppError(
                f"Cannot receive {receipt['quantity']} of {line.raw_material.name}: "
                f"only {remaining:.4f} remains outstanding on this line."
            )

    for receipt in receipts:
        line = lines_by_id[receipt["line_id"]]
        qty = float(receipt["quantity"])
        inventory_service.adjust_stock(
            db,
            item_type="raw_material",
            item_id=line.raw_material_id,
            quantity=qty,
            movement_type="receipt",
            reference_type="purchase_order",
            reference_id=po.id,
            notes=f"Received against {po.po_number}",
            user_id=user_id,
        )
        line.received_quantity = float(line.received_quantity) + qty

    all_received = all(float(l.received_quantity) >= float(l.quantity) for l in po.lines)
    old_status = po.status
    po.status = "received" if all_received else "partially_received"
    po.updated_by = user_id
    audit_service.log_update(
        db, TABLE_NAME, po_id, {"status": (old_status, po.status)}, user_id
    )
    db.commit()
    return get_purchase_order(db, po_id)


def delete_purchase_order(db: Session, po_id: int, user_id: int | None = None) -> None:
    po = get_purchase_order(db, po_id)
    if po.status != "draft":
        raise ConflictError("Only draft purchase orders can be deleted; cancel confirmed ones instead.")
    po.deleted_at = datetime.now(timezone.utc)
    audit_service.log_delete(db, TABLE_NAME, po_id, user_id)
    db.commit()


def restore_purchase_order(db: Session, po_id: int, user_id: int | None = None) -> PurchaseOrder:
    po = get_purchase_order(db, po_id, include_deleted=True)
    po.deleted_at = None
    audit_service.log_restore(db, TABLE_NAME, po_id, user_id)
    db.commit()
    return get_purchase_order(db, po_id)
