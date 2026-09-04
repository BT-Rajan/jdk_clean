from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.customer import Customer
from app.models.inventory import FinishedGoodsInventory, RawMaterialInventory, StockMovement
from app.models.order import ORDER_STATUSES, Order, OrderDetail
from app.models.product import Product
from app.models.production_schedule import PRODUCTION_STATUSES, ProductionSchedule
from app.models.purchase_order import PURCHASE_ORDER_STATUSES, PurchaseOrder, PurchaseOrderLine
from app.models.quotation import Quotation
from app.models.raw_material import RawMaterial
from app.models.supplier import Supplier

# Orders in these statuses aren't real committed revenue -- a draft is
# nothing until confirmed, a cancelled order never happened. Every
# revenue figure in this report (monthly trend, status breakdown, top
# customers/products) excludes them; order_count and quotation_count
# still count everything so the trend reflects actual sales activity,
# not just the subset that already turned into money.
REVENUE_STATUSES = tuple(s for s in ORDER_STATUSES if s not in ("draft", "cancelled"))

# Same idea for purchase orders: a draft PO was never actually placed,
# and a cancelled one never happened -- every spend figure in the
# purchasing report excludes them.
SPEND_STATUSES = tuple(s for s in PURCHASE_ORDER_STATUSES if s not in ("draft", "cancelled"))

# Stock-movement types grouped into the same three buckets the
# dashboard's own _stock_movement widget already uses (see
# dashboard_service.py), so the inventory report's monthly trend reads
# consistently with that existing chart rather than introducing a
# fourth way of grouping the same seven movement types.
INBOUND_MOVEMENT_TYPES = ("receipt", "return")
OUTBOUND_MOVEMENT_TYPES = ("issue", "return_to_supplier")
PRODUCTION_MOVEMENT_TYPES = ("production_in", "production_out")


def _month_bounds(year: int, month: int) -> tuple[date, date]:
    """(start, end-exclusive) for the given calendar month."""
    start = date(year, month, 1)
    end = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)
    return start, end


def _last_n_months(today: date, months: int) -> list[tuple[int, int]]:
    """[(year, month), ...] for the `months` calendar months ending with
    today's, oldest first -- same walk-backwards-by-hand approach
    dashboard_service.py's _monthly_po_trend uses rather than a SQL
    date-trunc, so a partial current month is still included as-is.
    """
    buckets = []
    y, m = today.year, today.month
    for _ in range(months):
        buckets.append((y, m))
        m -= 1
        if m == 0:
            m = 12
            y -= 1
    buckets.reverse()
    return buckets


def get_sales_report(db: Session, months: int = 12) -> dict:
    """Revenue/order trend over the last `months` calendar months, plus
    a status breakdown, top customers/products, and quotation->order
    conversion -- all scoped to that same window so every number on the
    page is drawn from one consistent date range. Computed fresh on
    every call, same as dashboard_service.get_stats -- nothing cached.
    """
    today = date.today()
    buckets = _last_n_months(today, months)
    range_start, _ = _month_bounds(*buckets[0])
    _, range_end_exclusive = _month_bounds(*buckets[-1])
    range_end = range_end_exclusive - timedelta(days=1)

    monthly = []
    for year, month in buckets:
        start, end = _month_bounds(year, month)
        base = db.query(Order).filter(
            Order.deleted_at.is_(None),
            Order.order_date >= start,
            Order.order_date < end,
        )
        order_count = base.count()
        revenue = (
            base.filter(Order.status.in_(REVENUE_STATUSES))
            .with_entities(func.coalesce(func.sum(Order.total_amount), 0))
            .scalar()
        )
        quotation_count = (
            db.query(Quotation)
            .filter(
                Quotation.deleted_at.is_(None),
                Quotation.quotation_date >= start,
                Quotation.quotation_date < end,
            )
            .count()
        )
        monthly.append(
            {
                "year": year,
                "month": month,
                "label": start.strftime("%b %Y"),
                "order_count": order_count,
                "revenue": round(float(revenue or 0), 3),
                "quotation_count": quotation_count,
            }
        )

    by_status = []
    for status in ORDER_STATUSES:
        q = db.query(Order).filter(
            Order.deleted_at.is_(None),
            Order.order_date >= range_start,
            Order.order_date < range_end_exclusive,
            Order.status == status,
        )
        count = q.count()
        revenue = q.with_entities(func.coalesce(func.sum(Order.total_amount), 0)).scalar()
        by_status.append({"status": status, "count": count, "revenue": round(float(revenue or 0), 3)})

    top_customer_rows = (
        db.query(
            Customer.id,
            Customer.name,
            func.sum(Order.total_amount).label("revenue"),
            func.count(Order.id).label("order_count"),
        )
        .join(Order, Order.customer_id == Customer.id)
        .filter(
            Order.deleted_at.is_(None),
            Order.order_date >= range_start,
            Order.order_date < range_end_exclusive,
            Order.status.in_(REVENUE_STATUSES),
        )
        .group_by(Customer.id, Customer.name)
        .order_by(func.sum(Order.total_amount).desc())
        .limit(10)
        .all()
    )
    top_customers = [
        {
            "customer_id": row.id,
            "customer_name": row.name,
            "revenue": round(float(row.revenue or 0), 3),
            "order_count": row.order_count,
        }
        for row in top_customer_rows
    ]

    top_product_rows = (
        db.query(
            Product.id,
            Product.code,
            Product.name,
            func.sum(OrderDetail.line_total).label("revenue"),
            func.sum(OrderDetail.quantity).label("quantity"),
        )
        .join(OrderDetail, OrderDetail.product_id == Product.id)
        .join(Order, Order.id == OrderDetail.order_id)
        .filter(
            Order.deleted_at.is_(None),
            Order.order_date >= range_start,
            Order.order_date < range_end_exclusive,
            Order.status.in_(REVENUE_STATUSES),
        )
        .group_by(Product.id, Product.code, Product.name)
        .order_by(func.sum(OrderDetail.line_total).desc())
        .limit(10)
        .all()
    )
    top_products = [
        {
            "product_id": row.id,
            "code": row.code,
            "name": row.name,
            "revenue": round(float(row.revenue or 0), 3),
            "quantity": round(float(row.quantity or 0), 4),
        }
        for row in top_product_rows
    ]

    total_quotations = (
        db.query(Quotation)
        .filter(
            Quotation.deleted_at.is_(None),
            Quotation.quotation_date >= range_start,
            Quotation.quotation_date < range_end_exclusive,
        )
        .count()
    )
    converted_quotations = (
        db.query(Quotation)
        .filter(
            Quotation.deleted_at.is_(None),
            Quotation.quotation_date >= range_start,
            Quotation.quotation_date < range_end_exclusive,
            Quotation.status == "converted",
        )
        .count()
    )
    conversion_rate = round((converted_quotations / total_quotations) * 100, 1) if total_quotations else 0.0

    return {
        "generated_at": datetime.now(timezone.utc),
        "range_start": range_start,
        "range_end": range_end,
        "monthly": monthly,
        "by_status": by_status,
        "top_customers": top_customers,
        "top_products": top_products,
        "quotation_conversion": {
            "total_quotations": total_quotations,
            "converted_quotations": converted_quotations,
            "conversion_rate": conversion_rate,
        },
    }


def get_sales_drilldown(
    db: Session,
    year: int | None = None,
    month: int | None = None,
    status: str | None = None,
    customer_id: int | None = None,
    product_id: int | None = None,
) -> list[dict]:
    """The individual orders behind one chart click -- a month bar, a
    status slice, a top-customer/top-product bar, or any combination.
    Capped at 200 rows (most-recent-first) since this is a drill-down
    preview, not a full paginated list -- see the Orders page for that.
    """
    query = db.query(Order).filter(Order.deleted_at.is_(None))
    if year is not None and month is not None:
        start, end = _month_bounds(year, month)
        query = query.filter(Order.order_date >= start, Order.order_date < end)
    if status:
        query = query.filter(Order.status == status)
    if customer_id is not None:
        query = query.filter(Order.customer_id == customer_id)
    if product_id is not None:
        query = query.join(OrderDetail, OrderDetail.order_id == Order.id).filter(
            OrderDetail.product_id == product_id
        )

    orders = query.distinct().order_by(Order.order_date.desc()).limit(200).all()
    return [
        {
            "id": o.id,
            "order_number": o.order_number,
            "customer_name": o.customer.name if o.customer else None,
            "order_date": o.order_date,
            "status": o.status,
            "total_amount": float(o.total_amount),
        }
        for o in orders
    ]


def get_production_report(db: Session, months: int = 12) -> dict:
    """Same shape as get_sales_report, scoped to production batches
    instead of orders -- batches bucketed by scheduled_start (when a
    batch was scheduled, not when it finished, so a batch scheduled
    this month but still in_progress still shows up in this month's
    trend rather than not appearing until it completes)."""
    today = date.today()
    buckets = _last_n_months(today, months)
    range_start, _ = _month_bounds(*buckets[0])
    _, range_end_exclusive = _month_bounds(*buckets[-1])
    range_end = range_end_exclusive - timedelta(days=1)

    monthly = []
    for year, month in buckets:
        start, end = _month_bounds(year, month)
        base = db.query(ProductionSchedule).filter(
            ProductionSchedule.deleted_at.is_(None),
            ProductionSchedule.scheduled_start >= start,
            ProductionSchedule.scheduled_start < end,
        )
        batch_count = base.count()
        planned = base.with_entities(func.coalesce(func.sum(ProductionSchedule.planned_quantity), 0)).scalar()
        produced = (
            base.filter(ProductionSchedule.status == "completed")
            .with_entities(func.coalesce(func.sum(ProductionSchedule.produced_quantity), 0))
            .scalar()
        )
        monthly.append(
            {
                "year": year,
                "month": month,
                "label": start.strftime("%b %Y"),
                "batch_count": batch_count,
                "planned_quantity": round(float(planned or 0), 4),
                "produced_quantity": round(float(produced or 0), 4),
            }
        )

    by_status = []
    for status in PRODUCTION_STATUSES:
        q = db.query(ProductionSchedule).filter(
            ProductionSchedule.deleted_at.is_(None),
            ProductionSchedule.scheduled_start >= range_start,
            ProductionSchedule.scheduled_start < range_end_exclusive,
            ProductionSchedule.status == status,
        )
        count = q.count()
        planned = q.with_entities(func.coalesce(func.sum(ProductionSchedule.planned_quantity), 0)).scalar()
        by_status.append({"status": status, "count": count, "planned_quantity": round(float(planned or 0), 4)})

    top_product_rows = (
        db.query(
            Product.id,
            Product.code,
            Product.name,
            func.count(ProductionSchedule.id).label("batch_count"),
            func.sum(ProductionSchedule.produced_quantity).label("produced_quantity"),
        )
        .join(ProductionSchedule, ProductionSchedule.product_id == Product.id)
        .filter(
            ProductionSchedule.deleted_at.is_(None),
            ProductionSchedule.status == "completed",
            ProductionSchedule.scheduled_start >= range_start,
            ProductionSchedule.scheduled_start < range_end_exclusive,
        )
        .group_by(Product.id, Product.code, Product.name)
        .order_by(func.sum(ProductionSchedule.produced_quantity).desc())
        .limit(10)
        .all()
    )
    top_products = [
        {
            "product_id": row.id,
            "code": row.code,
            "name": row.name,
            "batch_count": row.batch_count,
            "produced_quantity": round(float(row.produced_quantity or 0), 4),
        }
        for row in top_product_rows
    ]

    material_discrepancy_count = (
        db.query(ProductionSchedule)
        .filter(
            ProductionSchedule.deleted_at.is_(None),
            ProductionSchedule.material_discrepancy_flag.is_(True),
            ProductionSchedule.scheduled_start >= range_start,
            ProductionSchedule.scheduled_start < range_end_exclusive,
        )
        .count()
    )

    return {
        "generated_at": datetime.now(timezone.utc),
        "range_start": range_start,
        "range_end": range_end,
        "monthly": monthly,
        "by_status": by_status,
        "top_products": top_products,
        "material_discrepancy_count": material_discrepancy_count,
    }


def get_production_drilldown(
    db: Session,
    year: int | None = None,
    month: int | None = None,
    status: str | None = None,
    product_id: int | None = None,
) -> list[dict]:
    query = db.query(ProductionSchedule).filter(ProductionSchedule.deleted_at.is_(None))
    if year is not None and month is not None:
        start, end = _month_bounds(year, month)
        query = query.filter(ProductionSchedule.scheduled_start >= start, ProductionSchedule.scheduled_start < end)
    if status:
        query = query.filter(ProductionSchedule.status == status)
    if product_id is not None:
        query = query.filter(ProductionSchedule.product_id == product_id)

    batches = query.order_by(ProductionSchedule.scheduled_start.desc()).limit(200).all()
    return [
        {
            "id": b.id,
            "batch_number": b.batch_number,
            "product_name": b.product.name if b.product else None,
            "scheduled_start": b.scheduled_start,
            "status": b.status,
            "planned_quantity": float(b.planned_quantity),
            "produced_quantity": float(b.produced_quantity),
        }
        for b in batches
    ]


def get_purchasing_report(db: Session, months: int = 12) -> dict:
    """Same shape as get_sales_report, scoped to purchase orders --
    spend excludes draft/cancelled POs (SPEND_STATUSES) the same way
    sales revenue excludes draft/cancelled orders."""
    today = date.today()
    buckets = _last_n_months(today, months)
    range_start, _ = _month_bounds(*buckets[0])
    _, range_end_exclusive = _month_bounds(*buckets[-1])
    range_end = range_end_exclusive - timedelta(days=1)

    monthly = []
    for year, month in buckets:
        start, end = _month_bounds(year, month)
        base = db.query(PurchaseOrder).filter(
            PurchaseOrder.deleted_at.is_(None),
            PurchaseOrder.order_date >= start,
            PurchaseOrder.order_date < end,
        )
        po_count = base.count()
        spend = (
            base.filter(PurchaseOrder.status.in_(SPEND_STATUSES))
            .with_entities(func.coalesce(func.sum(PurchaseOrder.total_amount), 0))
            .scalar()
        )
        monthly.append(
            {
                "year": year,
                "month": month,
                "label": start.strftime("%b %Y"),
                "po_count": po_count,
                "spend": round(float(spend or 0), 3),
            }
        )

    by_status = []
    for status in PURCHASE_ORDER_STATUSES:
        q = db.query(PurchaseOrder).filter(
            PurchaseOrder.deleted_at.is_(None),
            PurchaseOrder.order_date >= range_start,
            PurchaseOrder.order_date < range_end_exclusive,
            PurchaseOrder.status == status,
        )
        count = q.count()
        spend = q.with_entities(func.coalesce(func.sum(PurchaseOrder.total_amount), 0)).scalar()
        by_status.append({"status": status, "count": count, "spend": round(float(spend or 0), 3)})

    top_supplier_rows = (
        db.query(
            Supplier.id,
            Supplier.name,
            func.sum(PurchaseOrder.total_amount).label("spend"),
            func.count(PurchaseOrder.id).label("po_count"),
        )
        .join(PurchaseOrder, PurchaseOrder.supplier_id == Supplier.id)
        .filter(
            PurchaseOrder.deleted_at.is_(None),
            PurchaseOrder.order_date >= range_start,
            PurchaseOrder.order_date < range_end_exclusive,
            PurchaseOrder.status.in_(SPEND_STATUSES),
        )
        .group_by(Supplier.id, Supplier.name)
        .order_by(func.sum(PurchaseOrder.total_amount).desc())
        .limit(10)
        .all()
    )
    top_suppliers = [
        {
            "supplier_id": row.id,
            "supplier_name": row.name,
            "spend": round(float(row.spend or 0), 3),
            "po_count": row.po_count,
        }
        for row in top_supplier_rows
    ]

    top_material_rows = (
        db.query(
            RawMaterial.id,
            RawMaterial.code,
            RawMaterial.name,
            func.sum(PurchaseOrderLine.line_total).label("spend"),
            func.sum(PurchaseOrderLine.quantity).label("quantity"),
        )
        .join(PurchaseOrderLine, PurchaseOrderLine.raw_material_id == RawMaterial.id)
        .join(PurchaseOrder, PurchaseOrder.id == PurchaseOrderLine.purchase_order_id)
        .filter(
            PurchaseOrder.deleted_at.is_(None),
            PurchaseOrder.order_date >= range_start,
            PurchaseOrder.order_date < range_end_exclusive,
            PurchaseOrder.status.in_(SPEND_STATUSES),
        )
        .group_by(RawMaterial.id, RawMaterial.code, RawMaterial.name)
        .order_by(func.sum(PurchaseOrderLine.line_total).desc())
        .limit(10)
        .all()
    )
    top_materials = [
        {
            "raw_material_id": row.id,
            "code": row.code,
            "name": row.name,
            "spend": round(float(row.spend or 0), 3),
            "quantity": round(float(row.quantity or 0), 4),
        }
        for row in top_material_rows
    ]

    return {
        "generated_at": datetime.now(timezone.utc),
        "range_start": range_start,
        "range_end": range_end,
        "monthly": monthly,
        "by_status": by_status,
        "top_suppliers": top_suppliers,
        "top_materials": top_materials,
    }


def get_purchasing_drilldown(
    db: Session,
    year: int | None = None,
    month: int | None = None,
    status: str | None = None,
    supplier_id: int | None = None,
    raw_material_id: int | None = None,
) -> list[dict]:
    query = db.query(PurchaseOrder).filter(PurchaseOrder.deleted_at.is_(None))
    if year is not None and month is not None:
        start, end = _month_bounds(year, month)
        query = query.filter(PurchaseOrder.order_date >= start, PurchaseOrder.order_date < end)
    if status:
        query = query.filter(PurchaseOrder.status == status)
    if supplier_id is not None:
        query = query.filter(PurchaseOrder.supplier_id == supplier_id)
    if raw_material_id is not None:
        query = query.join(PurchaseOrderLine, PurchaseOrderLine.purchase_order_id == PurchaseOrder.id).filter(
            PurchaseOrderLine.raw_material_id == raw_material_id
        )

    orders = query.distinct().order_by(PurchaseOrder.order_date.desc()).limit(200).all()
    return [
        {
            "id": po.id,
            "po_number": po.po_number,
            "supplier_name": po.supplier.name if po.supplier else None,
            "order_date": po.order_date,
            "status": po.status,
            "total_amount": float(po.total_amount),
        }
        for po in orders
    ]


def get_inventory_report(db: Session, months: int = 12) -> dict:
    """Unlike the sales/production/purchasing reports, inventory has no
    natural "revenue" figure -- this pairs a monthly stock-movement
    trend (inbound/outbound/production, the same three buckets
    dashboard_service's own _stock_movement widget uses) with the
    current, not time-windowed, snapshot the dashboard also shows
    (inventory value, low-stock count) since "value right now" is what
    actually matters for those two, not "value back then"."""
    today = date.today()
    buckets = _last_n_months(today, months)
    range_start, _ = _month_bounds(*buckets[0])
    _, range_end_exclusive = _month_bounds(*buckets[-1])
    range_end = range_end_exclusive - timedelta(days=1)

    monthly = []
    for year, month in buckets:
        start, end = _month_bounds(year, month)
        rows = (
            db.query(StockMovement.movement_type, func.coalesce(func.sum(StockMovement.quantity), 0))
            .filter(StockMovement.created_at >= start, StockMovement.created_at < end)
            .group_by(StockMovement.movement_type)
            .all()
        )
        totals = {movement_type: float(qty) for movement_type, qty in rows}
        monthly.append(
            {
                "year": year,
                "month": month,
                "label": start.strftime("%b %Y"),
                # quantity is signed in the ledger (an 'issue' is stored
                # negative -- it decreases stock), so each type's total is
                # abs()'d before summing: this is a "how much moved"
                # magnitude for the chart, not a net change that would
                # otherwise render outbound as a negative-going bar.
                "inbound": round(sum(abs(totals.get(t, 0)) for t in INBOUND_MOVEMENT_TYPES), 4),
                "outbound": round(sum(abs(totals.get(t, 0)) for t in OUTBOUND_MOVEMENT_TYPES), 4),
                "production": round(sum(abs(totals.get(t, 0)) for t in PRODUCTION_MOVEMENT_TYPES), 4),
            }
        )

    range_rows = (
        db.query(
            StockMovement.movement_type,
            func.count(StockMovement.id),
            func.coalesce(func.sum(StockMovement.quantity), 0),
        )
        .filter(StockMovement.created_at >= range_start, StockMovement.created_at < range_end_exclusive)
        .group_by(StockMovement.movement_type)
        .all()
    )
    counts_by_type = {mt: (int(c), float(q)) for mt, c, q in range_rows}
    by_movement_type = [
        {
            "movement_type": mt,
            "count": counts_by_type.get(mt, (0, 0.0))[0],
            "quantity": round(abs(counts_by_type.get(mt, (0, 0.0))[1]), 4),
        }
        for mt in (
            "receipt",
            "issue",
            "adjustment",
            "production_in",
            "production_out",
            "return",
            "return_to_supplier",
        )
    ]

    # item_id is polymorphic (raw_material vs product), so "top items"
    # needs two separate grouped queries -- one per item_type joined to
    # its own real table -- merged and re-sorted in Python rather than
    # one query trying to join two different tables through one column.
    # func.abs() per row: quantity is signed (an 'issue' is negative), so
    # a plain sum would net receipts against issues into how much an
    # item's stock changed -- "top items" means most active, i.e. total
    # movement volume regardless of direction, not net change.
    raw_material_rows = (
        db.query(
            RawMaterial.id,
            RawMaterial.code,
            RawMaterial.name,
            func.sum(func.abs(StockMovement.quantity)).label("quantity"),
        )
        .join(StockMovement, StockMovement.item_id == RawMaterial.id)
        .filter(
            StockMovement.item_type == "raw_material",
            StockMovement.created_at >= range_start,
            StockMovement.created_at < range_end_exclusive,
        )
        .group_by(RawMaterial.id, RawMaterial.code, RawMaterial.name)
        .all()
    )
    product_rows = (
        db.query(
            Product.id,
            Product.code,
            Product.name,
            func.sum(func.abs(StockMovement.quantity)).label("quantity"),
        )
        .join(StockMovement, StockMovement.item_id == Product.id)
        .filter(
            StockMovement.item_type == "product",
            StockMovement.created_at >= range_start,
            StockMovement.created_at < range_end_exclusive,
        )
        .group_by(Product.id, Product.code, Product.name)
        .all()
    )
    top_items = sorted(
        [
            {"item_type": "raw_material", "item_id": r.id, "code": r.code, "name": r.name, "quantity": float(r.quantity or 0)}
            for r in raw_material_rows
        ]
        + [
            {"item_type": "product", "item_id": r.id, "code": r.code, "name": r.name, "quantity": float(r.quantity or 0)}
            for r in product_rows
        ],
        key=lambda item: item["quantity"],
        reverse=True,
    )[:10]
    for item in top_items:
        item["quantity"] = round(item["quantity"], 4)

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
    low_stock_count = (
        db.query(RawMaterialInventory)
        .join(RawMaterial, RawMaterialInventory.raw_material_id == RawMaterial.id)
        .filter(
            RawMaterial.deleted_at.is_(None),
            RawMaterialInventory.quantity_on_hand <= RawMaterial.reorder_point,
        )
        .count()
    )

    return {
        "generated_at": datetime.now(timezone.utc),
        "range_start": range_start,
        "range_end": range_end,
        "raw_material_value": round(float(raw_value), 3),
        "finished_goods_value": round(float(finished_value), 3),
        "low_stock_count": low_stock_count,
        "monthly": monthly,
        "by_movement_type": by_movement_type,
        "top_items": top_items,
    }


def get_inventory_drilldown(
    db: Session,
    year: int | None = None,
    month: int | None = None,
    movement_type: str | None = None,
    item_type: str | None = None,
    item_id: int | None = None,
) -> list[dict]:
    query = db.query(StockMovement)
    if year is not None and month is not None:
        start, end = _month_bounds(year, month)
        query = query.filter(StockMovement.created_at >= start, StockMovement.created_at < end)
    if movement_type:
        query = query.filter(StockMovement.movement_type == movement_type)
    if item_type:
        query = query.filter(StockMovement.item_type == item_type)
    if item_id is not None:
        query = query.filter(StockMovement.item_id == item_id)

    movements = query.order_by(StockMovement.created_at.desc()).limit(200).all()

    # Batch-resolve item names in two lookups (not one query per row) --
    # movements is capped at 200, so this is at most 2 extra queries
    # total, not up to 200 of them.
    raw_material_ids = {m.item_id for m in movements if m.item_type == "raw_material"}
    product_ids = {m.item_id for m in movements if m.item_type == "product"}
    raw_material_names = {}
    if raw_material_ids:
        raw_material_names = {
            r.id: r.name for r in db.query(RawMaterial).filter(RawMaterial.id.in_(raw_material_ids)).all()
        }
    product_names = {}
    if product_ids:
        product_names = {p.id: p.name for p in db.query(Product).filter(Product.id.in_(product_ids)).all()}

    result = []
    for m in movements:
        if m.item_type == "raw_material":
            name = raw_material_names.get(m.item_id)
            route = f"/raw-materials/{m.item_id}" if m.item_id in raw_material_names else None
        else:
            name = product_names.get(m.item_id)
            route = f"/products/{m.item_id}" if m.item_id in product_names else None
        result.append(
            {
                "id": m.id,
                "item_type": m.item_type,
                "item_name": name,
                "item_route": route,
                "movement_type": m.movement_type,
                # abs() -- movement_type already says the direction
                # ("issue" vs "receipt"), a signed number next to it read
                # as redundant/confusing (e.g. "-50" beside an Issue badge).
                "quantity": abs(float(m.quantity)),
                "created_at": m.created_at,
                "notes": m.notes,
            }
        )
    return result
