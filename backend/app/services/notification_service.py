from datetime import date, datetime, timezone

from sqlalchemy.orm import Session, joinedload

from app.models.feasibility import FeasibilityCheck
from app.models.inventory import RawMaterialInventory
from app.models.order import Order
from app.models.production_schedule import ProductionSchedule
from app.models.raw_material import RawMaterial
from app.models.user import User

# Which roles/departments each notification *type* is relevant to. Mirrors
# lib/roles.ts on the frontend: admin/manager always see everything;
# sales/procurement/warehouse staff see only what's relevant to their
# department, same as canWriteDepartment gates their write access.
ADMIN_ROLES = ("admin", "manager")


def _visible(user: User, departments: tuple[str, ...] | None) -> bool:
    """departments=None means admin/manager-only (e.g. admin-review
    escalations). Otherwise: admin/manager see it regardless, staff see it
    only if their department matches."""
    if user.role in ADMIN_ROLES:
        return True
    if departments is None:
        return False
    return user.role == "staff" and user.department in departments


def get_notifications(db: Session, user: User, limit: int = 50) -> list[dict]:
    """Every notification is computed fresh from real records each call --
    nothing here is a stored/mocked notification row. Each item links back
    to the record it's about so acting on it means going to that record,
    not managing a separate parallel to-do list.
    """
    items: list[dict] = []

    # 1. Feasibility checks flagged for admin review (Sales overrode an
    # infeasible result, or the check sat open past the 5-day SLA).
    if _visible(user, None):
        checks = (
            db.query(FeasibilityCheck)
            .options(joinedload(FeasibilityCheck.customer))
            .filter(FeasibilityCheck.deleted_at.is_(None), FeasibilityCheck.admin_review_required.is_(True))
            .order_by(FeasibilityCheck.updated_at.desc())
            .all()
        )
        for c in checks:
            reason = (
                "Sales overrode an infeasible result"
                if c.admin_review_reason == "override"
                else "Open more than 5 days with no resolution"
            )
            items.append(
                {
                    "id": f"feasibility-review-{c.id}",
                    "type": "feasibility_admin_review",
                    "severity": "high",
                    "title": f"{c.feasibility_number} needs admin review",
                    "message": f"{reason} — {c.customer.name if c.customer else 'unknown customer'}.",
                    "link": f"/feasibilities/{c.id}",
                    "created_at": c.updated_at,
                }
            )

    # 2. Orders flagged for admin review (overdue with no delivery note / close reason).
    if _visible(user, None):
        orders = (
            db.query(Order)
            .options(joinedload(Order.customer))
            .filter(Order.deleted_at.is_(None), Order.admin_review_required.is_(True))
            .order_by(Order.updated_at.desc())
            .all()
        )
        for o in orders:
            items.append(
                {
                    "id": f"order-review-{o.id}",
                    "type": "order_admin_review",
                    "severity": "high",
                    "title": f"{o.order_number} is overdue",
                    "message": f"Past its delivery date with no delivery note or close reason — {o.customer.name if o.customer else 'unknown customer'}.",
                    "link": f"/orders/{o.id}",
                    "created_at": o.updated_at,
                }
            )

    # 3. Feasibility checks awaiting a Sales exception decision (came back
    # short on materials/capacity and hasn't been overridden or rejected yet).
    if _visible(user, ("sales",)):
        pending = (
            db.query(FeasibilityCheck)
            .options(joinedload(FeasibilityCheck.customer))
            .filter(FeasibilityCheck.deleted_at.is_(None), FeasibilityCheck.status == "exception_pending")
            .order_by(FeasibilityCheck.checked_at.desc())
            .all()
        )
        for c in pending:
            items.append(
                {
                    "id": f"feasibility-exception-{c.id}",
                    "type": "feasibility_exception_pending",
                    "severity": "medium",
                    "title": f"{c.feasibility_number} came back short",
                    "message": f"Needs a decision: override with a comment, or reject — {c.customer.name if c.customer else 'unknown customer'}.",
                    "link": f"/feasibilities/{c.id}",
                    "created_at": c.checked_at or c.created_at,
                }
            )

    # 4. Raw materials at or below their reorder point.
    if _visible(user, ("procurement", "warehouse")):
        low_stock = (
            db.query(RawMaterial, RawMaterialInventory)
            .join(RawMaterialInventory, RawMaterialInventory.raw_material_id == RawMaterial.id)
            .filter(
                RawMaterial.deleted_at.is_(None),
                RawMaterial.status == "active",
                RawMaterialInventory.quantity_on_hand <= RawMaterial.reorder_point,
            )
            .order_by(RawMaterial.code)
            .all()
        )
        for material, inv in low_stock:
            items.append(
                {
                    "id": f"low-stock-{material.id}",
                    "type": "low_stock",
                    "severity": "medium",
                    "title": f"{material.code} is low on stock",
                    "message": f"{float(inv.quantity_on_hand)} {material.unit} on hand, reorder point is {float(material.reorder_point)} {material.unit}.",
                    "link": "/raw-materials",
                    "created_at": inv.updated_at,
                }
            )

    # 5. Production batches past their scheduled end without being completed.
    if _visible(user, ("warehouse",)):
        today = date.today()
        delayed = (
            db.query(ProductionSchedule)
            .options(joinedload(ProductionSchedule.product))
            .filter(
                ProductionSchedule.deleted_at.is_(None),
                ProductionSchedule.status.in_(("planned", "in_progress")),
                ProductionSchedule.scheduled_end < today,
            )
            .order_by(ProductionSchedule.scheduled_end)
            .all()
        )
        for batch in delayed:
            days_late = (today - batch.scheduled_end).days
            items.append(
                {
                    "id": f"production-delayed-{batch.id}",
                    "type": "production_delayed",
                    "severity": "medium",
                    "title": f"{batch.batch_number} is behind schedule",
                    "message": f"{days_late} day{'s' if days_late != 1 else ''} past its scheduled end — {batch.product.name if batch.product else 'unknown product'}.",
                    "link": "/production",
                    "created_at": batch.updated_at,
                }
            )

    # 6. Feasibility checks stuck on a missing formula (BOM) rather than a
    # genuine shortage -- a data-setup gap in Factory Setup, not something
    # Sales can resolve by overriding. Distinct from #3 above (which is
    # about a real material/capacity shortfall) so it routes to whoever
    # actually owns product setup, not Sales.
    if _visible(user, ("warehouse",)):
        bom_gaps = (
            db.query(FeasibilityCheck)
            .options(joinedload(FeasibilityCheck.customer), joinedload(FeasibilityCheck.lines))
            .filter(
                FeasibilityCheck.deleted_at.is_(None),
                FeasibilityCheck.status == "exception_pending",
            )
            .all()
        )
        for c in bom_gaps:
            missing_products = {
                line.product.code for line in c.lines if line.bom_missing and line.product
            }
            if not missing_products:
                continue
            items.append(
                {
                    "id": f"feasibility-bom-missing-{c.id}",
                    "type": "feasibility_bom_missing",
                    "severity": "medium",
                    "title": f"{c.feasibility_number} is blocked on a missing formula",
                    "message": f"No BOM set up for {', '.join(sorted(missing_products))} — set it up in Factory Setup.",
                    "link": "/factory-setup",
                    "created_at": c.checked_at or c.created_at,
                }
            )

    # 7. Auto-created quotations still sitting in draft, never sent --
    # Sales needs to review and either send or discard them, since the
    # system drafted them but deliberately doesn't send anything itself.
    if _visible(user, ("sales",)):
        from app.models.quotation import Quotation

        unreviewed = (
            db.query(Quotation)
            .options(joinedload(Quotation.customer))
            .filter(
                Quotation.deleted_at.is_(None),
                Quotation.auto_created.is_(True),
                Quotation.status == "draft",
            )
            .order_by(Quotation.created_at)
            .all()
        )
        for q in unreviewed:
            items.append(
                {
                    "id": f"quotation-auto-draft-{q.id}",
                    "type": "quotation_auto_draft_unreviewed",
                    "severity": "low",
                    "title": f"{q.quotation_number} was auto-drafted and needs review",
                    "message": f"Auto-created from a passed feasibility check — review and send, or discard — {q.customer.name if q.customer else 'unknown customer'}.",
                    "link": f"/quotations/{q.id}",
                    "created_at": q.created_at,
                }
            )

    # 8. Auto-drafted purchase orders still sitting in draft, never sent
    # -- Procurement needs to review and either send or discard them,
    # same as the auto-created-quotation notification above but for the
    # procurement side.
    if _visible(user, ("procurement",)):
        from app.models.purchase_order import PurchaseOrder

        unreviewed_pos = (
            db.query(PurchaseOrder)
            .options(joinedload(PurchaseOrder.supplier))
            .filter(
                PurchaseOrder.deleted_at.is_(None),
                PurchaseOrder.auto_created.is_(True),
                PurchaseOrder.status == "draft",
            )
            .order_by(PurchaseOrder.created_at)
            .all()
        )
        for po in unreviewed_pos:
            items.append(
                {
                    "id": f"po-auto-draft-{po.id}",
                    "type": "purchase_order_auto_draft_unreviewed",
                    "severity": "low",
                    "title": f"{po.po_number} was auto-drafted from an MRP shortage",
                    "message": f"Review quantities and pricing, then send or discard — {po.supplier.name if po.supplier else 'unknown supplier'}.",
                    "link": f"/purchase-orders/{po.id}",
                    "created_at": po.created_at,
                }
            )

    # 9. Draft purchase orders at/above the large-PO approval threshold
    # that haven't been approved yet -- admin needs to sign off before
    # this can be sent to its supplier.
    if _visible(user, None):
        from app.models.purchase_order import PurchaseOrder as PO
        from app.services import settings_service

        threshold = settings_service.get_large_po_approval_threshold(db)
        if threshold is not None:
            awaiting_approval = (
                db.query(PO)
                .options(joinedload(PO.supplier))
                .filter(
                    PO.deleted_at.is_(None),
                    PO.status == "draft",
                    PO.approved_at.is_(None),
                    PO.total_amount >= threshold,
                )
                .all()
            )
            for po in awaiting_approval:
                items.append(
                    {
                        "id": f"po-needs-approval-{po.id}",
                        "type": "purchase_order_needs_approval",
                        "severity": "high",
                        "title": f"{po.po_number} needs approval before it can be sent",
                        "message": f"KWD {float(po.total_amount):,.2f} is at or above the large-PO threshold — {po.supplier.name if po.supplier else 'unknown supplier'}.",
                        "link": f"/purchase-orders/{po.id}",
                        "created_at": po.created_at,
                    }
                )

    def _sort_key(item: dict):
        created = item["created_at"]
        if created is None:
            return datetime.min.replace(tzinfo=timezone.utc)
        if created.tzinfo is None:
            return created.replace(tzinfo=timezone.utc)
        return created

    items.sort(key=_sort_key, reverse=True)
    return items[:limit]
