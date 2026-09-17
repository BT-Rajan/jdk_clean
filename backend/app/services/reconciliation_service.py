"""P10 -- Production, Inventory & Transaction Reconciliation.

Read-only exception detection over existing tables: deterministic
business-rule checks, not an anomaly-detection or forecasting system.
Every check here compares two numbers this app already computes
elsewhere (a plan vs. what actually happened) and reports a genuine
mismatch -- it never corrects, adjusts, or writes anything. See
docs/production-lifecycle.md and this module's own spec (P10) for the
full reasoning; each check below names the invariant it verifies and
the ordinary transaction mechanism that keeps it true in the normal
case (this is the safety net for when that invariant is ever violated,
whether by a future bug or by data predating a fix).

Every exception row has the exact shape the P10 spec's compact
reconciliation UI wants: area / document / product-or-material /
expected / actual / difference / status. No pagination, no filtering,
no aggregation beyond this -- callers wanting a subset filter the
returned list themselves (there are never more than a handful of these
in a healthy system).
"""

from sqlalchemy.orm import Session

from app.models.delivery_note import DeliveryNote, DeliveryNoteLine
from app.models.inventory import StockMovement
from app.models.order import Order, OrderDetail
from app.models.production_execution import ProductionExecution
from app.models.production_order import ProductionOrder
from app.models.production_order_material import ProductionOrderMaterialRequirement


def _row(area: str, document: str, product_or_material: str, expected: float, actual: float, kind: str) -> dict:
    difference = round(actual - expected, 4)
    return {
        "area": area,
        "document": document,
        "product_or_material": product_or_material,
        "expected": expected,
        "actual": actual,
        "difference": difference,
        "status": "exception",
        "kind": kind,
    }


def _check_production_overproduction(db: Session) -> list[dict]:
    """A Production Order's total completed output must never exceed its
    own planned_quantity (complete_execution's own guard is what keeps
    this true on every ordinary write; this is the safety net)."""
    exceptions = []
    orders = db.query(ProductionOrder).filter(ProductionOrder.status != "cancelled").all()
    for po in orders:
        total_produced = (
            db.query(ProductionExecution)
            .filter(ProductionExecution.production_order_id == po.id, ProductionExecution.status == "completed")
            .with_entities(ProductionExecution.produced_quantity)
            .all()
        )
        produced = round(sum(float(p[0]) for p in total_produced), 4)
        planned = float(po.planned_quantity)
        if produced > planned:
            exceptions.append(
                _row(
                    "Production", po.production_order_number, po.product.code if po.product else str(po.product_id),
                    planned, produced, "overproduction",
                )
            )
    return exceptions


def _check_material_over_consumption(db: Session) -> list[dict]:
    """consumed_quantity must never exceed allocated_quantity (consume()
    always grows allocated_quantity to at least cover what it consumes,
    even on the variance path) -- a violation here means the two ran out
    of sync, not a legitimate BOM variance (that's required vs. consumed,
    covered by _check_material_variance below, and is never an exception
    on its own)."""
    exceptions = []
    rows = db.query(ProductionOrderMaterialRequirement).filter(
        ProductionOrderMaterialRequirement.consumed_quantity > ProductionOrderMaterialRequirement.allocated_quantity
    ).all()
    for r in rows:
        exceptions.append(
            _row(
                "Material Consumption", r.production_order.production_order_number, r.raw_material.name,
                float(r.allocated_quantity), float(r.consumed_quantity), "consumed_exceeds_allocated",
            )
        )
    return exceptions


def _check_cancelled_order_leftover_allocation(db: Session) -> list[dict]:
    """A cancelled Production Order must have no remaining allocated-and-
    unconsumed material left (production_order_service.change_status's
    cancellation branch auto-releases this on every ordinary write)."""
    exceptions = []
    rows = (
        db.query(ProductionOrderMaterialRequirement)
        .join(ProductionOrder, ProductionOrderMaterialRequirement.production_order_id == ProductionOrder.id)
        .filter(ProductionOrder.status == "cancelled")
        .all()
    )
    for r in rows:
        remaining = round(float(r.allocated_quantity) - float(r.consumed_quantity), 4)
        if remaining > 0:
            exceptions.append(
                _row(
                    "Material Allocation", r.production_order.production_order_number, r.raw_material.name,
                    0.0, remaining, "cancelled_order_leftover_allocation",
                )
            )
    return exceptions


def _check_qc_over_decision(db: Session) -> list[dict]:
    """A completed run's accepted + rejected QC quantity must never
    exceed what it actually produced (qc_service's own partial accept/
    reject guards keep this true on every ordinary write)."""
    exceptions = []
    executions = db.query(ProductionExecution).filter(ProductionExecution.status == "completed").all()
    for execution in executions:
        decided = round(float(execution.released_quantity) + float(execution.rejected_quantity), 4)
        produced = float(execution.produced_quantity)
        if decided > produced:
            exceptions.append(
                _row(
                    "QC", f"Execution #{execution.id}", execution.product.code if execution.product else str(execution.product_id),
                    produced, decided, "qc_exceeds_produced",
                )
            )
    return exceptions


def _check_order_over_delivery(db: Session) -> list[dict]:
    """An order line's total delivered quantity (across every issued
    delivery note) must never exceed what was ordered (delivery_note_
    service's own stock-availability/quantity validation keeps this true
    on every ordinary write)."""
    exceptions = []
    lines = db.query(OrderDetail).all()
    for line in lines:
        delivered = (
            db.query(DeliveryNoteLine)
            .join(DeliveryNote, DeliveryNoteLine.delivery_note_id == DeliveryNote.id)
            .filter(
                DeliveryNote.order_id == line.order_id,
                DeliveryNote.status == "issued",
                DeliveryNoteLine.product_id == line.product_id,
            )
            .with_entities(DeliveryNoteLine.quantity_delivered)
            .all()
        )
        total_delivered = round(sum(float(d[0]) for d in delivered), 4)
        ordered = float(line.quantity)
        if total_delivered > ordered:
            order = db.query(Order).filter(Order.id == line.order_id).first()
            exceptions.append(
                _row(
                    "Delivery", order.order_number if order else str(line.order_id),
                    line.product.code if line.product else str(line.product_id),
                    ordered, total_delivered, "over_delivered",
                )
            )
    return exceptions


def _check_delivery_without_inventory_movement(db: Session) -> list[dict]:
    """Every issued delivery note line must have a matching stock
    movement deducting finished-goods stock, traceable to that specific
    note (delivery_note_service.change_status's own atomic issue path
    creates this on every ordinary write -- see P9)."""
    exceptions = []
    issued_lines = (
        db.query(DeliveryNoteLine)
        .join(DeliveryNote, DeliveryNoteLine.delivery_note_id == DeliveryNote.id)
        .filter(DeliveryNote.status == "issued")
        .all()
    )
    for line in issued_lines:
        movement = (
            db.query(StockMovement)
            .filter(
                StockMovement.item_type == "product",
                StockMovement.item_id == line.product_id,
                StockMovement.reference_type == "delivery_note",
                StockMovement.reference_id == line.delivery_note_id,
            )
            .first()
        )
        moved = abs(float(movement.quantity)) if movement else 0.0
        expected = float(line.quantity_delivered)
        if moved != expected:
            exceptions.append(
                _row(
                    "Delivery", line.delivery_note.delivery_note_number,
                    line.product.code if line.product else str(line.product_id),
                    expected, moved, "delivery_without_inventory_movement",
                )
            )
    return exceptions


def _check_duplicate_inventory_transactions(db: Session) -> list[dict]:
    """A single delivery note line should create exactly one stock
    movement -- more than one referencing the same (item, reference_type,
    reference_id) triple for a delivery note means a duplicate deduction
    slipped through (delivery_note_service's duplicate-issue protection,
    P9 Test 9, is what keeps this from happening on every ordinary
    write)."""
    exceptions = []
    rows = (
        db.query(
            StockMovement.item_id,
            StockMovement.reference_id,
        )
        .filter(StockMovement.reference_type == "delivery_note", StockMovement.item_type == "product")
        .all()
    )
    seen: dict[tuple, int] = {}
    for item_id, reference_id in rows:
        key = (item_id, reference_id)
        seen[key] = seen.get(key, 0) + 1
    for (item_id, reference_id), count in seen.items():
        if count > 1:
            note = db.query(DeliveryNote).filter(DeliveryNote.id == reference_id).first()
            exceptions.append(
                _row(
                    "Delivery", note.delivery_note_number if note else f"Delivery note #{reference_id}",
                    str(item_id), 1, count, "duplicate_inventory_transaction",
                )
            )
    return exceptions


def get_exceptions(db: Session) -> list[dict]:
    """Runs every deterministic reconciliation check and returns the
    combined exception list, most-recently-relevant checks first isn't
    meaningful here (there's no ranking) -- grouped by area instead, in
    the order the P10 spec itself lists them."""
    exceptions: list[dict] = []
    exceptions += _check_production_overproduction(db)
    exceptions += _check_material_over_consumption(db)
    exceptions += _check_cancelled_order_leftover_allocation(db)
    exceptions += _check_qc_over_decision(db)
    exceptions += _check_order_over_delivery(db)
    exceptions += _check_delivery_without_inventory_movement(db)
    exceptions += _check_duplicate_inventory_transactions(db)
    return exceptions
