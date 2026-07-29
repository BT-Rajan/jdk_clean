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

    def _sort_key(item: dict):
        created = item["created_at"]
        if created is None:
            return datetime.min.replace(tzinfo=timezone.utc)
        if created.tzinfo is None:
            return created.replace(tzinfo=timezone.utc)
        return created

    items.sort(key=_sort_key, reverse=True)
    return items[:limit]
