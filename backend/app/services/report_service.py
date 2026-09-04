from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.customer import Customer
from app.models.order import ORDER_STATUSES, Order, OrderDetail
from app.models.product import Product
from app.models.quotation import Quotation

# Orders in these statuses aren't real committed revenue -- a draft is
# nothing until confirmed, a cancelled order never happened. Every
# revenue figure in this report (monthly trend, status breakdown, top
# customers/products) excludes them; order_count and quotation_count
# still count everything so the trend reflects actual sales activity,
# not just the subset that already turned into money.
REVENUE_STATUSES = tuple(s for s in ORDER_STATUSES if s not in ("draft", "cancelled"))


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
