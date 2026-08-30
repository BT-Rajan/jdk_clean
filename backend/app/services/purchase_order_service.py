from datetime import date, datetime, timedelta, timezone
from typing import Any

from sqlalchemy.orm import Session, joinedload

from app.core.exceptions import ConflictError, NotFoundError, ValidationAppError
from app.core.pagination import sort_and_paginate
from app.core.pricing import compute_document_totals, price_line
from app.core.workflow import assert_reason_given, assert_transition_allowed
from app.models.purchase_order import ALLOWED_TRANSITIONS, PurchaseOrder, PurchaseOrderLine
from app.models.raw_material import RawMaterial
from app.models.supplier import Supplier
from app.services import audit_service, inventory_service, mrp_service, number_series_service, settings_service

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
        discount_percent = float(line.get("discount_percent") or 0)
        line_total = price_line(float(line["quantity"]), float(line["unit_price"]), discount_percent)
        priced.append({**line, "discount_percent": discount_percent, "line_total": line_total})
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
    subtotal_amount = round(sum(line["line_total"] for line in lines), 2)
    discount_percent = float(data.pop("discount_percent", None) or 0)
    totals = compute_document_totals(subtotal_amount, discount_percent)

    po_number = number_series_service.next_number(db, "PURCHASE_ORDER")

    po = PurchaseOrder(
        po_number=po_number,
        subtotal_amount=subtotal_amount,
        discount_percent=discount_percent,
        discount_amount=totals["discount_amount"],
        total_amount=totals["total_amount"],
        created_by=user_id,
        **data,
    )
    po.lines = [PurchaseOrderLine(**line) for line in lines]

    db.add(po)
    db.flush()
    audit_service.log_create(db, TABLE_NAME, po.id, user_id)
    db.commit()
    db.refresh(po)
    return get_purchase_order(db, po.id)


def auto_draft_from_mrp_shortages(db: Session, user_id: int | None = None) -> list[PurchaseOrder]:
    """MRP already knows exactly what's short and, for each material,
    which supplier(s) could cover it (mrp_service.compute_requirements's
    suggested_purchases -- a real greedy allocation across known
    suppliers by lead time, respecting each one's max_supply_quantity).
    This turns that into actual draft purchase orders: one per supplier,
    grouping every material that supplier was suggested for. Always
    lands in 'draft' -- never sent automatically -- for procurement to
    review, adjust, and send by hand (see notification_service.py for
    the accompanying "needs review" notification).

    Materials with no known supplier (no SupplierMaterial row at all)
    are skipped -- there's nothing to draft a PO against; the shortage
    still shows on the MRP report itself for a person to source
    manually. Materials already covered by an existing non-cancelled PO
    line are also skipped, so re-running this periodically (see
    core/scheduler.py) doesn't pile up duplicate drafts for the same
    shortage.
    """
    requirements = mrp_service.compute_requirements(db)
    if not requirements:
        return []

    already_pending = {
        row.raw_material_id
        for row in db.query(PurchaseOrderLine.raw_material_id)
        .join(PurchaseOrder, PurchaseOrderLine.purchase_order_id == PurchaseOrder.id)
        .filter(
            PurchaseOrder.deleted_at.is_(None),
            PurchaseOrder.status.in_(("draft", "sent", "confirmed", "partially_received")),
        )
        .all()
    }

    # Group this run's supplier suggestions -- one PO per supplier,
    # covering every material that supplier was suggested for.
    by_supplier: dict[int, list[dict]] = {}
    for req in requirements:
        raw_material_id = req["raw_material_id"]
        if raw_material_id in already_pending:
            continue
        for suggestion in req["suggested_purchases"]:
            by_supplier.setdefault(suggestion["supplier_id"], []).append(
                {
                    "raw_material_id": raw_material_id,
                    "quantity": suggestion["quantity"],
                    "lead_time_days": suggestion["lead_time_days"],
                }
            )

    if not by_supplier:
        return []

    material_ids = {line["raw_material_id"] for lines in by_supplier.values() for line in lines}
    materials = {m.id: m for m in db.query(RawMaterial).filter(RawMaterial.id.in_(material_ids)).all()}

    created: list[PurchaseOrder] = []
    today = datetime.now(timezone.utc).date()
    for supplier_id, lines in by_supplier.items():
        max_lead_time = max((line["lead_time_days"] or 7) for line in lines)
        po_lines = []
        for line in lines:
            material = materials.get(line["raw_material_id"])
            if material is None:
                continue
            po_lines.append(
                {
                    "raw_material_id": line["raw_material_id"],
                    "quantity": line["quantity"],
                    # A starting estimate procurement adjusts before
                    # sending -- this is a draft, not a commitment.
                    "unit_price": float(material.unit_cost),
                }
            )
        if not po_lines:
            continue
        try:
            po = create_purchase_order(
                db,
                {
                    "supplier_id": supplier_id,
                    "order_date": today,
                    "expected_delivery_date": today + timedelta(days=max_lead_time),
                    "notes": "Auto-drafted from an MRP shortage. Review quantities and pricing before sending.",
                    "auto_created": True,
                    "lines": po_lines,
                },
                user_id=user_id,
            )
            created.append(po)
        except (ConflictError, ValidationAppError):
            # Best-effort convenience, not a hard requirement -- the
            # shortage is still visible on the MRP report either way.
            continue

    return created


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
    discount_percent_update = data.pop("discount_percent", None)
    if data.get("supplier_id") is None:
        data.pop("supplier_id", None)

    for field, new_value in data.items():
        old_value = getattr(po, field)
        if old_value != new_value:
            changes[field] = (old_value, new_value)
            setattr(po, field, new_value)

    if discount_percent_update is not None and float(discount_percent_update) != float(po.discount_percent):
        changes["discount_percent"] = (po.discount_percent, discount_percent_update)
        po.discount_percent = discount_percent_update
        po.approved_at = None
        po.approved_by = None

    if lines is not None:
        priced = _price_lines(db, [dict(line) for line in lines])
        po.lines.clear()
        db.flush()
        po.lines = [PurchaseOrderLine(**line) for line in priced]
        po.subtotal_amount = round(sum(line["line_total"] for line in priced), 2)
        changes["lines"] = ("(previous lines)", "(updated lines)")
        po.approved_at = None
        po.approved_by = None

    if lines is not None or discount_percent_update is not None:
        totals = compute_document_totals(float(po.subtotal_amount), float(po.discount_percent))
        po.discount_amount = totals["discount_amount"]
        po.total_amount = totals["total_amount"]

    po.updated_by = user_id
    audit_service.log_update(db, TABLE_NAME, po_id, changes, user_id)
    db.commit()
    return get_purchase_order(db, po_id)


def change_status(
    db: Session, po_id: int, new_status: str, reason: str | None = None, user_id: int | None = None
) -> PurchaseOrder:
    """Handles the plain transitions (draft->sent->confirmed, and
    cancelling). Receiving goods is deliberately NOT one of these -- it
    needs per-line quantities, so it's its own action (receive_lines)."""
    po = get_purchase_order(db, po_id)
    assert_transition_allowed(ALLOWED_TRANSITIONS, po.status, new_status, "purchase order")

    if new_status == "sent":
        amount_threshold = settings_service.get_large_po_approval_threshold(db)
        if amount_threshold is not None and float(po.total_amount) >= amount_threshold and po.approved_at is None:
            raise ConflictError(
                f"This purchase order (KWD {float(po.total_amount):,.2f}) is at or above the "
                f"large-PO approval threshold (KWD {amount_threshold:,.2f}) and needs admin approval "
                f"before it can be sent."
            )
        discount_threshold = settings_service.get_large_discount_approval_threshold(db)
        if discount_threshold is not None and po.approved_at is None:
            largest = max(
                [float(po.discount_percent)] + [float(line.discount_percent) for line in po.lines],
                default=0.0,
            )
            if largest >= discount_threshold:
                raise ConflictError(
                    f"This purchase order has a discount of {largest}%, at or above the large-discount "
                    f"approval threshold ({discount_threshold}%), and needs admin approval before it can be sent."
                )
    elif new_status == "cancelled":
        assert_reason_given(reason, "A reason is required to cancel a purchase order.")
        po.cancel_reason = reason

    old_status = po.status
    po.status = new_status
    po.updated_by = user_id
    audit_service.log_update(db, TABLE_NAME, po_id, {"status": (old_status, new_status)}, user_id)
    db.commit()
    return get_purchase_order(db, po_id)


def approve_purchase_order(db: Session, po_id: int, user_id: int | None = None) -> PurchaseOrder:
    """Admin sign-off clearing the large-PO gate above -- can be called
    any time a PO is still draft, whether or not it's actually at/above
    the current threshold (the threshold can change after the PO was
    drafted; approving early never hurts)."""
    po = get_purchase_order(db, po_id)
    if po.status != "draft":
        raise ConflictError("Only a draft purchase order can be approved.")
    po.approved_at = datetime.now(timezone.utc)
    po.approved_by = user_id
    po.updated_by = user_id
    audit_service.log_update(
        db, TABLE_NAME, po_id, {"approved_at": (None, po.approved_at.isoformat())}, user_id
    )
    db.commit()
    return get_purchase_order(db, po_id)


def receive_lines(
    db: Session,
    po_id: int,
    receipts: list[dict],
    user_id: int | None = None,
    invoice_number: str | None = None,
    received_by: str | None = None,
    received_date=None,
) -> PurchaseOrder:
    """Records goods received against one or more lines -- possibly
    partial, possibly spread across several calls as deliveries arrive
    over time. Each receipt increases raw material stock on hand and the
    line's received_quantity; the PO's overall status is recomputed from
    the lines afterward rather than being something the caller sets
    directly.

    inventory_service.adjust_stock requires supplier, cost, invoice
    number, receiver, and date on every raw-material receipt -- supplier
    and (unless overridden per line) unit cost come from the PO itself,
    since that's already known; invoice_number/received_by/received_date
    describe the physical delivery this call represents and are shared
    across every line in it (one delivery, one invoice, one receiver, one
    date), same as a paper goods-received note would record once per
    delivery rather than once per line item.
    """
    po = get_purchase_order(db, po_id)
    if po.status not in ("confirmed", "partially_received"):
        raise ConflictError(
            f"Cannot receive goods against a purchase order in '{po.status}' status; "
            "it must be confirmed first."
        )
    if not invoice_number or not received_by:
        raise ValidationAppError("invoice_number and received_by are required to receive goods.")
    received_date = received_date or date.today()

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
            supplier_id=po.supplier_id,
            unit_cost=receipt.get("unit_cost") if receipt.get("unit_cost") is not None else float(line.unit_price),
            batch_number=receipt.get("batch_number"),
            expiry_date=receipt.get("expiry_date"),
            invoice_number=invoice_number,
            received_by=received_by,
            received_date=received_date,
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


def escalate_overdue_purchase_orders(db: Session, as_of: date | None = None) -> list[PurchaseOrder]:
    """The purchasing-side mirror of order_service.escalate_overdue_orders:
    flags every PO whose expected_delivery_date has passed with nothing
    received and not cancelled -- a supplier running late -- for admin
    attention. Meant to be run periodically (e.g. an external cron
    hitting the scan endpoint); idempotent -- re-running only (re)flags
    POs that still qualify, it never clears admin_review_required itself
    (only change_status on cancel, or admin_review, does that).
    """
    today = as_of or datetime.now(timezone.utc).date()

    candidates = (
        db.query(PurchaseOrder)
        .filter(
            PurchaseOrder.deleted_at.is_(None),
            PurchaseOrder.status.notin_(("received", "cancelled")),
            PurchaseOrder.admin_review_required.is_(False),
            PurchaseOrder.expected_delivery_date.isnot(None),
        )
        .all()
    )

    flagged: list[PurchaseOrder] = []
    for po in candidates:
        if po.expected_delivery_date < today:
            po.admin_review_required = True
            audit_service.log_update(
                db, TABLE_NAME, po.id, {"admin_review_required": (False, True)}, None
            )
            flagged.append(po)

    if flagged:
        db.commit()
    return flagged


def admin_review(db: Session, po_id: int, notes: str, user_id: int | None = None) -> PurchaseOrder:
    """Admin clears an overdue-delivery escalation, recording their decision."""
    po = get_purchase_order(db, po_id)
    if not po.admin_review_required:
        raise ConflictError("This purchase order has no pending admin review.")

    po.admin_review_required = False
    po.admin_reviewed_at = datetime.now(timezone.utc)
    po.admin_reviewed_by = user_id
    po.admin_review_notes = notes
    po.updated_by = user_id
    audit_service.log_update(
        db, TABLE_NAME, po_id, {"admin_review_required": (True, False)}, user_id
    )
    db.commit()
    return get_purchase_order(db, po_id)
