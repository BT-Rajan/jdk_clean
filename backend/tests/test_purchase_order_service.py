"""Regression tests for purchase_order_service's core lifecycle: create/
update draft-only editing, the large-PO approval gate (including a
supplier's own threshold override), receiving goods (partial, full,
over-receipt rejection), and the overdue-delivery admin-review
escalation. Priority 2 from the production/procurement maturity audit --
this service had no dedicated test coverage at all before.
"""

from datetime import date, timedelta

import pytest

from app.core.exceptions import ConflictError, ValidationAppError
from app.models.setting import Setting
from app.services import inventory_service, purchase_order_service

from .factories import make_purchase_order, make_raw_material, make_supplier

TODAY = date(2026, 1, 15)


def _set_global_po_threshold(db, value: str) -> None:
    db.add(Setting(setting_key="large_po_approval_threshold", setting_value=value))
    db.flush()


def test_create_purchase_order_computes_totals(db):
    material = make_raw_material(db)
    supplier = make_supplier(db)

    po = purchase_order_service.create_purchase_order(
        db,
        {
            "supplier_id": supplier.id,
            "order_date": TODAY,
            "lines": [{"raw_material_id": material.id, "quantity": 10, "unit_price": 5}],
        },
    )

    assert po.status == "draft"
    assert float(po.subtotal_amount) == 50
    assert float(po.total_amount) == 50


def test_update_only_allowed_while_draft(db):
    material = make_raw_material(db)
    supplier = make_supplier(db)
    po = make_purchase_order(db, supplier.id, lines=[{"raw_material_id": material.id, "quantity": 10, "unit_price": 5}], status="sent")

    with pytest.raises(ConflictError):
        purchase_order_service.update_purchase_order(db, po.id, {"notes": "changed"})


def test_sending_a_po_at_or_above_global_threshold_is_blocked_without_approval(db):
    _set_global_po_threshold(db, "100")
    material = make_raw_material(db)
    supplier = make_supplier(db)
    po = purchase_order_service.create_purchase_order(
        db,
        {
            "supplier_id": supplier.id,
            "order_date": TODAY,
            "lines": [{"raw_material_id": material.id, "quantity": 100, "unit_price": 2}],  # 200 total
        },
    )

    with pytest.raises(ConflictError):
        purchase_order_service.change_status(db, po.id, "sent")

    approved = purchase_order_service.approve_purchase_order(db, po.id)
    sent = purchase_order_service.change_status(db, approved.id, "sent")
    assert sent.status == "sent"


def test_supplier_override_raises_the_threshold_for_just_that_supplier(db):
    _set_global_po_threshold(db, "100")
    material = make_raw_material(db)
    trusted_supplier = make_supplier(db, po_approval_threshold_override=10000)
    po = purchase_order_service.create_purchase_order(
        db,
        {
            "supplier_id": trusted_supplier.id,
            "order_date": TODAY,
            "lines": [{"raw_material_id": material.id, "quantity": 100, "unit_price": 2}],  # 200 total
        },
    )

    # Would be blocked by the global threshold (100) but this supplier's
    # own override (10000) lets it through unapproved.
    sent = purchase_order_service.change_status(db, po.id, "sent")
    assert sent.status == "sent"


def test_receive_lines_partial_then_full(db):
    material = make_raw_material(db)
    supplier = make_supplier(db)
    po = make_purchase_order(
        db, supplier.id, lines=[{"raw_material_id": material.id, "quantity": 10, "unit_price": 5}], status="confirmed"
    )
    on_hand_before = inventory_service.get_stock(db, "raw_material", material.id)["quantity_on_hand"]

    line_id = po.lines[0].id
    partial = purchase_order_service.receive_lines(
        db, po.id, [{"line_id": line_id, "quantity": 6}],
        invoice_number="INV-1", received_by="Warehouse Clerk",
    )
    assert partial.status == "partially_received"
    assert inventory_service.get_stock(db, "raw_material", material.id)["quantity_on_hand"] == on_hand_before + 6

    full = purchase_order_service.receive_lines(
        db, po.id, [{"line_id": line_id, "quantity": 4}],
        invoice_number="INV-2", received_by="Warehouse Clerk",
    )
    assert full.status == "received"
    assert inventory_service.get_stock(db, "raw_material", material.id)["quantity_on_hand"] == on_hand_before + 10


def test_receive_lines_rejects_over_receipt(db):
    material = make_raw_material(db)
    supplier = make_supplier(db)
    po = make_purchase_order(
        db, supplier.id, lines=[{"raw_material_id": material.id, "quantity": 10, "unit_price": 5}], status="confirmed"
    )

    with pytest.raises(ValidationAppError):
        purchase_order_service.receive_lines(
            db, po.id, [{"line_id": po.lines[0].id, "quantity": 11}],
            invoice_number="INV-1", received_by="Warehouse Clerk",
        )


def test_receive_lines_requires_invoice_and_receiver(db):
    material = make_raw_material(db)
    supplier = make_supplier(db)
    po = make_purchase_order(
        db, supplier.id, lines=[{"raw_material_id": material.id, "quantity": 10, "unit_price": 5}], status="confirmed"
    )

    with pytest.raises(ValidationAppError):
        purchase_order_service.receive_lines(db, po.id, [{"line_id": po.lines[0].id, "quantity": 5}])


def test_receive_lines_rejected_before_confirmed(db):
    material = make_raw_material(db)
    supplier = make_supplier(db)
    po = make_purchase_order(
        db, supplier.id, lines=[{"raw_material_id": material.id, "quantity": 10, "unit_price": 5}], status="draft"
    )

    with pytest.raises(ConflictError):
        purchase_order_service.receive_lines(
            db, po.id, [{"line_id": po.lines[0].id, "quantity": 5}],
            invoice_number="INV-1", received_by="Warehouse Clerk",
        )


def test_delete_only_allowed_while_draft(db):
    material = make_raw_material(db)
    supplier = make_supplier(db)
    po = make_purchase_order(db, supplier.id, lines=[{"raw_material_id": material.id, "quantity": 10, "unit_price": 5}], status="sent")

    with pytest.raises(ConflictError):
        purchase_order_service.delete_purchase_order(db, po.id)


def test_cancel_purchase_order_line_leaves_other_lines_open(db):
    material_a = make_raw_material(db)
    material_b = make_raw_material(db)
    supplier = make_supplier(db)
    po = make_purchase_order(
        db, supplier.id,
        lines=[
            {"raw_material_id": material_a.id, "quantity": 10, "unit_price": 5},
            {"raw_material_id": material_b.id, "quantity": 4, "unit_price": 3},
        ],
        status="confirmed",
    )
    line_a = po.lines[0]

    cancelled = purchase_order_service.cancel_purchase_order_line(
        db, po.id, line_a.id, "Supplier discontinued this material."
    )
    assert cancelled.status == "confirmed"  # material_b's line is still outstanding
    reloaded_line_a = next(l for l in cancelled.lines if l.id == line_a.id)
    assert reloaded_line_a.is_cancelled is True
    assert reloaded_line_a.cancel_reason == "Supplier discontinued this material."

    # Receiving the remaining (still-open) line completes the PO even
    # though the cancelled line was never fulfilled.
    full = purchase_order_service.receive_lines(
        db, po.id, [{"line_id": cancelled.lines[1].id, "quantity": 4}],
        invoice_number="INV-1", received_by="Warehouse Clerk",
    )
    assert full.status == "received"


def test_cancel_purchase_order_line_writes_off_only_the_outstanding_remainder(db):
    material = make_raw_material(db)
    supplier = make_supplier(db)
    po = make_purchase_order(
        db, supplier.id, lines=[{"raw_material_id": material.id, "quantity": 10, "unit_price": 5}], status="confirmed"
    )
    purchase_order_service.receive_lines(
        db, po.id, [{"line_id": po.lines[0].id, "quantity": 6}],
        invoice_number="INV-1", received_by="Warehouse Clerk",
    )

    cancelled = purchase_order_service.cancel_purchase_order_line(
        db, po.id, po.lines[0].id, "Supplier can't ship the rest."
    )
    assert cancelled.status == "received"  # nothing left outstanding
    assert cancelled.lines[0].received_quantity == 6  # what already arrived is untouched


def test_cancel_purchase_order_line_rejects_fully_received_line(db):
    material = make_raw_material(db)
    supplier = make_supplier(db)
    po = make_purchase_order(
        db, supplier.id, lines=[{"raw_material_id": material.id, "quantity": 10, "unit_price": 5}], status="confirmed"
    )
    purchase_order_service.receive_lines(
        db, po.id, [{"line_id": po.lines[0].id, "quantity": 10}],
        invoice_number="INV-1", received_by="Warehouse Clerk",
    )

    with pytest.raises(ConflictError):
        purchase_order_service.cancel_purchase_order_line(db, po.id, po.lines[0].id, "Too late.")


def test_cancel_purchase_order_line_rejected_while_draft(db):
    material = make_raw_material(db)
    supplier = make_supplier(db)
    po = make_purchase_order(db, supplier.id, lines=[{"raw_material_id": material.id, "quantity": 10, "unit_price": 5}], status="draft")

    with pytest.raises(ConflictError):
        purchase_order_service.cancel_purchase_order_line(db, po.id, po.lines[0].id, "Not sent yet.")


def test_cancelling_every_line_cancels_the_whole_po(db):
    material = make_raw_material(db)
    supplier = make_supplier(db)
    po = make_purchase_order(
        db, supplier.id, lines=[{"raw_material_id": material.id, "quantity": 10, "unit_price": 5}], status="sent"
    )

    cancelled = purchase_order_service.cancel_purchase_order_line(db, po.id, po.lines[0].id, "Supplier went out of business.")
    assert cancelled.status == "cancelled"


def test_cannot_receive_against_a_cancelled_line(db):
    material_a = make_raw_material(db)
    material_b = make_raw_material(db)
    supplier = make_supplier(db)
    po = make_purchase_order(
        db, supplier.id,
        lines=[
            {"raw_material_id": material_a.id, "quantity": 10, "unit_price": 5},
            {"raw_material_id": material_b.id, "quantity": 4, "unit_price": 3},
        ],
        status="confirmed",
    )
    purchase_order_service.cancel_purchase_order_line(db, po.id, po.lines[0].id, "Discontinued.")

    with pytest.raises(ValidationAppError):
        purchase_order_service.receive_lines(
            db, po.id, [{"line_id": po.lines[0].id, "quantity": 1}],
            invoice_number="INV-1", received_by="Warehouse Clerk",
        )


def test_escalate_overdue_purchase_orders_and_admin_review(db):
    material = make_raw_material(db)
    supplier = make_supplier(db)
    po = make_purchase_order(
        db, supplier.id,
        lines=[{"raw_material_id": material.id, "quantity": 10, "unit_price": 5}],
        status="sent",
        expected_delivery_date=TODAY - timedelta(days=1),
    )

    flagged = purchase_order_service.escalate_overdue_purchase_orders(db, as_of=TODAY)
    assert po.id in {p.id for p in flagged}

    reviewed = purchase_order_service.admin_review(db, po.id, "Supplier confirmed it's on the way.")
    assert reviewed.admin_review_required is False

    with pytest.raises(ConflictError):
        purchase_order_service.admin_review(db, po.id, "Nothing pending now.")
