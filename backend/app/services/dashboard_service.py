from datetime import date, timedelta

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.customer import Customer
from app.models.inventory import FinishedGoodsInventory, RawMaterialInventory, StockMovement
from app.models.order import Order
from app.models.product import Product
from app.models.production_schedule import ProductionSchedule
from app.models.purchase_order import PurchaseOrder
from app.models.quotation import Quotation
from app.models.raw_material import RawMaterial
from app.models.supplier import Supplier
from app.models.user import User
from app.services import mrp_service

# Statuses that still count as a live/open purchase order for the
# "Pending POs" stat -- mirrors the same intent as order_service's
# OPEN_STATUSES, just for POs.
PO_PENDING_STATUSES = ("sent", "confirmed", "partially_received")

# A batch counts as "delayed" once its scheduled end has passed without
# being completed or cancelled, and "at risk" if that's imminent (within
# 2 days) -- used by the production-timeline graph.
AT_RISK_WINDOW_DAYS = 2


def _month_start(today: date) -> date:
    return today.replace(day=1)


def _stat(value, trend: dict | None = None) -> dict:
    result: dict = {"value": value}
    if trend is not None:
        result["trend"] = trend
    return result


def get_stats(db: Session) -> dict:
    """Every number and chart the Dashboard's widgets can show, computed
    fresh from the database on each call -- nothing here is mocked or
    cached client-side. Widgets the frontend doesn't have real data for
    (e.g. a generic 'system health' or 'module usage' metric) simply
    aren't computed here and aren't offered as a widget option either
    (see useDashboardPreferences.ts) rather than being faked.
    """
    today = date.today()
    month_start = _month_start(today)

    stats = {
        "customers_month": _stat(
            db.query(Customer).filter(Customer.created_at >= month_start, Customer.deleted_at.is_(None)).count()
        ),
        "quotations_month": _stat(
            db.query(Quotation).filter(Quotation.created_at >= month_start, Quotation.deleted_at.is_(None)).count()
        ),
        "orders_month": _stat(
            db.query(Order).filter(Order.created_at >= month_start, Order.deleted_at.is_(None)).count()
        ),
        "purchase_orders": _stat(
            db.query(PurchaseOrder)
            .filter(PurchaseOrder.deleted_at.is_(None), PurchaseOrder.status != "cancelled")
            .count()
        ),
        "purchase_orders_pending": _stat(
            db.query(PurchaseOrder)
            .filter(PurchaseOrder.deleted_at.is_(None), PurchaseOrder.status.in_(PO_PENDING_STATUSES))
            .count()
        ),
        "suppliers_count": _stat(
            db.query(Supplier).filter(Supplier.deleted_at.is_(None), Supplier.status == "active").count()
        ),
        "raw_materials_count": _stat(
            db.query(RawMaterial).filter(RawMaterial.deleted_at.is_(None), RawMaterial.status == "active").count()
        ),
        "total_users": _stat(db.query(User).filter(User.deleted_at.is_(None)).count()),
    }

    # Inventory: value + counts, joined against current stock levels.
    inv_value = (
        db.query(func.coalesce(func.sum(RawMaterialInventory.quantity_on_hand * RawMaterial.unit_cost), 0))
        .join(RawMaterial, RawMaterialInventory.raw_material_id == RawMaterial.id)
        .filter(RawMaterial.deleted_at.is_(None))
        .scalar()
    )
    stats["inventory_value"] = _stat(round(float(inv_value), 3))
    stats["inventory_items"] = _stat(
        db.query(RawMaterialInventory)
        .join(RawMaterial, RawMaterialInventory.raw_material_id == RawMaterial.id)
        .filter(RawMaterial.deleted_at.is_(None), RawMaterialInventory.quantity_on_hand > 0)
        .count()
    )
    stats["low_stock_count"] = _stat(
        db.query(RawMaterialInventory)
        .join(RawMaterial, RawMaterialInventory.raw_material_id == RawMaterial.id)
        .filter(
            RawMaterial.deleted_at.is_(None),
            RawMaterialInventory.quantity_on_hand <= RawMaterial.reorder_point,
        )
        .count()
    )

    # Production
    active_batches = (
        db.query(ProductionSchedule)
        .filter(ProductionSchedule.deleted_at.is_(None), ProductionSchedule.status.in_(("planned", "in_progress")))
        .all()
    )
    stats["production_active"] = _stat(len(active_batches))
    stats["production_delayed"] = _stat(sum(1 for b in active_batches if b.scheduled_end < today))

    completed = db.query(ProductionSchedule).filter(
        ProductionSchedule.deleted_at.is_(None), ProductionSchedule.status == "completed"
    ).count()
    total_finished = completed + db.query(ProductionSchedule).filter(
        ProductionSchedule.deleted_at.is_(None), ProductionSchedule.status == "cancelled"
    ).count()
    completion_pct = round((completed / total_finished) * 100) if total_finished > 0 else None
    stats["production_completion"] = _stat(f"{completion_pct}%" if completion_pct is not None else "—")

    graphs = {
        "sales_trend": _weekly_order_trend(db, today),
        "top_customers": _top_customers(db),
        "po_trend": _monthly_po_trend(db, today),
        "supplier_performance": _supplier_performance(db),
        "stock_movement": _stock_movement(db, today),
        "inventory_breakdown": _inventory_breakdown(db),
        "production_timeline": _production_timeline(db, today),
        "mrp_status": _mrp_status(db),
    }

    return {"stats": stats, "graphs": graphs}


def _weekly_order_trend(db: Session, today: date) -> list[dict]:
    points = []
    for i in range(3, -1, -1):
        week_end = today - timedelta(days=7 * i)
        week_start = week_end - timedelta(days=6)
        count = (
            db.query(Order)
            .filter(Order.deleted_at.is_(None), Order.order_date >= week_start, Order.order_date <= week_end)
            .count()
        )
        points.append({"label": f"{week_start.strftime('%b %d')}", "value": count})
    return points


def _top_customers(db: Session, limit: int = 4) -> list[dict]:
    rows = (
        db.query(Customer.name, func.count(Order.id).label("order_count"))
        .join(Order, Order.customer_id == Customer.id)
        .filter(Order.deleted_at.is_(None))
        .group_by(Customer.id, Customer.name)
        .order_by(func.count(Order.id).desc())
        .limit(limit)
        .all()
    )
    return [{"label": name, "value": int(count)} for name, count in rows]


def _monthly_po_trend(db: Session, today: date) -> list[dict]:
    points = []
    year, month = today.year, today.month
    for i in range(3, -1, -1):
        m = month - i
        y = year
        while m <= 0:
            m += 12
            y -= 1
        start = date(y, m, 1)
        end = date(y + 1, 1, 1) if m == 12 else date(y, m + 1, 1)
        count = (
            db.query(PurchaseOrder)
            .filter(
                PurchaseOrder.deleted_at.is_(None),
                PurchaseOrder.order_date >= start,
                PurchaseOrder.order_date < end,
            )
            .count()
        )
        points.append({"label": start.strftime("%b"), "value": count})
    return points


def _supplier_performance(db: Session, limit: int = 4) -> list[dict]:
    rows = (
        db.query(Supplier.name, Supplier.rating)
        .filter(Supplier.deleted_at.is_(None), Supplier.status == "active", Supplier.rating.isnot(None))
        .order_by(Supplier.rating.desc())
        .limit(limit)
        .all()
    )
    return [{"label": name, "value": int(rating)} for name, rating in rows]


def _stock_movement(db: Session, today: date, days: int = 30) -> list[dict]:
    since = today - timedelta(days=days)
    rows = (
        db.query(StockMovement.movement_type, func.coalesce(func.sum(StockMovement.quantity), 0))
        .filter(StockMovement.created_at >= since)
        .group_by(StockMovement.movement_type)
        .all()
    )
    totals = {movement_type: float(qty) for movement_type, qty in rows}
    return [
        {"label": "Inbound", "value": round(totals.get("receipt", 0) + totals.get("return", 0), 2)},
        {"label": "Outbound", "value": round(totals.get("issue", 0), 2)},
        {
            "label": "Production",
            "value": round(totals.get("production_in", 0) + totals.get("production_out", 0), 2),
        },
    ]


def _inventory_breakdown(db: Session) -> list[dict]:
    raw_value = (
        db.query(func.coalesce(func.sum(RawMaterialInventory.quantity_on_hand * RawMaterial.unit_cost), 0))
        .join(RawMaterial, RawMaterialInventory.raw_material_id == RawMaterial.id)
        .filter(RawMaterial.deleted_at.is_(None))
        .scalar()
    )
    finished_value = (
        db.query(func.coalesce(func.sum(FinishedGoodsInventory.quantity_on_hand * Product.selling_price), 0))
        .join(Product, FinishedGoodsInventory.product_id == Product.id)
        .filter(Product.deleted_at.is_(None))
        .scalar()
    )
    return [
        {"label": "Raw materials", "value": round(float(raw_value), 2)},
        {"label": "Finished goods", "value": round(float(finished_value), 2)},
    ]


def _production_timeline(db: Session, today: date) -> list[dict]:
    at_risk_by = today + timedelta(days=AT_RISK_WINDOW_DAYS)
    batches = (
        db.query(ProductionSchedule)
        .filter(ProductionSchedule.deleted_at.is_(None), ProductionSchedule.status.in_(("planned", "in_progress")))
        .all()
    )
    on_schedule = sum(1 for b in batches if b.scheduled_end > at_risk_by)
    at_risk = sum(1 for b in batches if today <= b.scheduled_end <= at_risk_by)
    delayed = sum(1 for b in batches if b.scheduled_end < today)
    return [
        {"label": "On schedule", "value": on_schedule},
        {"label": "At risk", "value": at_risk},
        {"label": "Delayed", "value": delayed},
    ]


def _mrp_status(db: Session) -> list[dict]:
    requirements = mrp_service.compute_requirements(db)
    required = sum(r["total_required"] for r in requirements)
    available = sum(r["current_on_hand"] for r in requirements)
    shortage = sum(r["shortfall"] for r in requirements)
    return [
        {"label": "Required", "value": round(required, 2)},
        {"label": "Available", "value": round(available, 2)},
        {"label": "Shortage", "value": round(shortage, 2)},
    ]
