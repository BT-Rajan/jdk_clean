"""Sales Home -- the compact operational workspace (Sales spec section 4).

Everything here is a scoped, server-side aggregate: a salesman gets counts
and next-actions for their own customers only (the same scope_by_customer
filter every other sales query uses); the Sales Manager / admin get
department-wide figures plus a per-salesman workload table. Nothing is
fetched wholesale and filtered in the browser.

"Attention" is deliberately a short list of concrete next actions, each one
click from the record that resolves it. It reads existing state only --
statuses, follow-up dates, delivery dates -- it doesn't re-implement any
workflow rule.
"""

from datetime import date

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.sales_scope import is_scoped_salesman, scope_by_customer, scope_customer_rows
from app.core.timezone import today_kuwait
from app.models.customer import Customer
from app.models.feasibility import OPEN_STATUSES as FEASIBILITY_OPEN_STATUSES
from app.models.feasibility import FeasibilityCheck
from app.models.invoice import Invoice
from app.models.order import Order
from app.models.quotation import Quotation
from app.models.user import User

OPEN_QUOTATION_STATUSES = ("draft", "accepted")
ACTIVE_ORDER_STATUSES = ("draft", "confirmed", "in_production", "ready_to_ship", "shipped")
SALESMAN_ROLES = ("team_member", "staff")
ATTENTION_LIST_LIMIT = 12

# Invoice buckets for Sales Home's "Needs attention" -- see the "Sales ->
# Finance Invoice Handoff" design doc's Sales Overview redesign section.
# Deliberately not the raw INVOICE_STATUSES one-for-one: 'draft' is
# momentary (see invoice_service.create_draft_invoice_for_order) and
# never worth its own bucket, and 'voided'/'paid'-and-shipped invoices
# aren't attention items at all.
INVOICE_WAITING_FINANCE_STATUSES = ("waiting_finance", "link_generated", "qr_ready")
INVOICE_AWAITING_PAYMENT_STATUSES = ("awaiting_payment", "partially_paid")


def _attention_items(db: Session, user: User, today: date) -> list[dict]:
    """Every open next action in the user's scope, most urgent first. Each
    carries the owning customer's assigned_to so the manager's table can
    attribute it to a salesman without a second pass."""
    items: list[dict] = []

    def add(rows, kind, title, detail_fn, link_fn, priority):
        for row in rows:
            items.append(
                {
                    "kind": kind,
                    "title": title,
                    "detail": detail_fn(row),
                    "customer_name": row.customer_name,
                    "assigned_to": row.assigned_to,
                    "link": link_fn(row),
                    "priority": priority,
                }
            )

    def rows(model, customer_col, *cols, filters):
        query = (
            db.query(model.id, cols[0].label("number"), *cols[1:], Customer.name.label("customer_name"), Customer.assigned_to)
            .join(Customer, Customer.id == customer_col)
            .filter(model.deleted_at.is_(None), Customer.deleted_at.is_(None), *filters)
        )
        return scope_by_customer(query, customer_col, user).all()

    # 1. Orders past their requested delivery date and still open.
    add(
        rows(
            Order, Order.customer_id, Order.order_number, Order.requested_delivery_date,
            filters=[
                Order.status.in_(("confirmed", "in_production", "ready_to_ship", "shipped")),
                Order.requested_delivery_date.isnot(None),
                Order.requested_delivery_date < today,
            ],
        ),
        "order_delivery_overdue", "Delivery overdue",
        lambda r: f"{r.number} was due {r.requested_delivery_date.isoformat()}",
        lambda r: f"/orders/{r.id}", 0,
    )
    # 2. Feasibility checks waiting on a Sales exception decision.
    add(
        rows(FeasibilityCheck, FeasibilityCheck.customer_id, FeasibilityCheck.feasibility_number,
             filters=[FeasibilityCheck.status == "exception_pending"]),
        "feasibility_exception", "Exception decision needed",
        lambda r: f"{r.number} came back not feasible as requested",
        lambda r: f"/feasibilities/{r.id}", 1,
    )
    # 3. Quotation follow-ups that have come due.
    add(
        rows(Quotation, Quotation.customer_id, Quotation.quotation_number, Quotation.next_followup_date,
             filters=[
                 Quotation.status == "draft",
                 Quotation.next_followup_date.isnot(None),
                 Quotation.next_followup_date <= today,
             ]),
        "quotation_followup", "Follow up with customer",
        lambda r: f"{r.number} follow-up was due {r.next_followup_date.isoformat()}",
        lambda r: f"/quotations/{r.id}", 2,
    )
    # 4. Accepted quotations not yet turned into an order.
    add(
        rows(Quotation, Quotation.customer_id, Quotation.quotation_number,
             filters=[Quotation.status == "accepted"]),
        "quotation_convert", "Convert to order",
        lambda r: f"{r.number} was accepted",
        lambda r: f"/quotations/{r.id}", 3,
    )
    # 5. Orders ready to ship.
    add(
        rows(Order, Order.customer_id, Order.order_number, filters=[Order.status == "ready_to_ship"]),
        "order_ready_to_ship", "Ready to ship",
        lambda r: f"{r.number} is ready for delivery",
        lambda r: f"/orders/{r.id}", 4,
    )
    # 6. Feasibility checks cleared for quotation.
    add(
        rows(FeasibilityCheck, FeasibilityCheck.customer_id, FeasibilityCheck.feasibility_number,
             filters=[FeasibilityCheck.status.in_(("feasible", "exception_approved"))]),
        "feasibility_quotable", "Ready to quote",
        lambda r: f"{r.number} is cleared for a quotation",
        lambda r: f"/feasibilities/{r.id}", 5,
    )
    # 7. Draft quotations to review and send.
    add(
        rows(Quotation, Quotation.customer_id, Quotation.quotation_number,
             filters=[Quotation.status == "draft", Quotation.next_followup_date.is_(None)]),
        "quotation_review", "Review and send",
        lambda r: f"{r.number} is still a draft",
        lambda r: f"/quotations/{r.id}", 6,
    )
    # 8. Draft orders waiting to be confirmed.
    add(
        rows(Order, Order.customer_id, Order.order_number, filters=[Order.status == "draft"]),
        "order_confirm", "Confirm order",
        lambda r: f"{r.number} is still a draft",
        lambda r: f"/orders/{r.id}", 7,
    )
    # 9. Invoices routed to Finance but no payment link generated yet.
    add(
        rows(Invoice, Invoice.customer_id, Invoice.invoice_number,
             filters=[Invoice.status.in_(INVOICE_WAITING_FINANCE_STATUSES)]),
        "invoice_waiting_finance", "Invoice awaiting Finance",
        lambda r: f"{r.number} is routed to Finance",
        lambda r: f"/invoices/{r.id}", 8,
    )
    # 10. Invoices with a live payment link, not yet fully paid.
    add(
        rows(Invoice, Invoice.customer_id, Invoice.invoice_number,
             filters=[Invoice.status.in_(INVOICE_AWAITING_PAYMENT_STATUSES)]),
        "invoice_awaiting_payment", "Awaiting payment",
        lambda r: f"{r.number} is awaiting payment",
        lambda r: f"/invoices/{r.id}", 9,
    )
    # 11. Paid invoices whose order hasn't shipped yet -- payment came in,
    # order processing needs to move.
    add(
        rows(Invoice, Invoice.customer_id, Invoice.invoice_number,
             filters=[Invoice.status == "paid", Invoice.order.has(Order.status.in_(ACTIVE_ORDER_STATUSES))]),
        "invoice_paid_processing", "Payment received -- order processing",
        lambda r: f"{r.number} is paid",
        lambda r: f"/invoices/{r.id}", 10,
    )
    items.sort(key=lambda i: (i["priority"], i["customer_name"]))
    return items


def list_salesmen(db: Session) -> list[User]:
    """The active salesmen (team_member/staff) of the Sales department --
    exactly the rows the manager's workload table lists, one per row. Not
    the full set a customer may be *assigned* to any more -- see
    list_assignable_customer_owners below for that."""
    from app.models.department import Department

    return (
        db.query(User)
        .join(Department, Department.id == User.department_id)
        .filter(
            Department.code == "sales",
            User.role.in_(SALESMAN_ROLES),
            User.is_active.is_(True),
            User.deleted_at.is_(None),
        )
        .order_by(User.full_name)
        .all()
    )


def list_assignable_customer_owners(db: Session) -> list[User]:
    """Everyone a customer may be assigned to: the Sales department's
    salesmen (list_salesmen above) plus its department_head(s) ("assign
    to himself") plus every admin ("or admin") -- a manager needs to be
    able to pull a customer back onto their own plate or an admin's, not
    just hand it to another salesman. Unioned by id so a user who somehow
    matches more than one clause (shouldn't normally happen) isn't
    listed twice."""
    from app.models.department import Department

    salesmen = list_salesmen(db)
    managers = (
        db.query(User)
        .join(Department, Department.id == User.department_id)
        .filter(
            Department.code == "sales",
            User.role == "department_head",
            User.is_active.is_(True),
            User.deleted_at.is_(None),
        )
        .all()
    )
    admins = (
        db.query(User)
        .filter(User.role == "admin", User.is_active.is_(True), User.deleted_at.is_(None))
        .all()
    )
    by_id = {u.id: u for u in (*salesmen, *managers, *admins)}
    return sorted(by_id.values(), key=lambda u: u.full_name)


def _count(query) -> int:
    return query.scalar() or 0


def get_sales_home(db: Session, user: User) -> dict:
    today = today_kuwait()
    own = is_scoped_salesman(user)

    customers = _count(scope_customer_rows(db.query(func.count(Customer.id)), user).filter(Customer.deleted_at.is_(None)))
    open_feasibility = _count(
        scope_by_customer(db.query(func.count(FeasibilityCheck.id)), FeasibilityCheck.customer_id, user).filter(
            FeasibilityCheck.deleted_at.is_(None), FeasibilityCheck.status.in_(tuple(FEASIBILITY_OPEN_STATUSES))
        )
    )
    open_quotations = _count(
        scope_by_customer(db.query(func.count(Quotation.id)), Quotation.customer_id, user).filter(
            Quotation.deleted_at.is_(None), Quotation.status.in_(OPEN_QUOTATION_STATUSES)
        )
    )
    active_orders = _count(
        scope_by_customer(db.query(func.count(Order.id)), Order.customer_id, user).filter(
            Order.deleted_at.is_(None), Order.status.in_(ACTIVE_ORDER_STATUSES)
        )
    )
    invoices_waiting_finance = _count(
        scope_by_customer(db.query(func.count(Invoice.id)), Invoice.customer_id, user).filter(
            Invoice.deleted_at.is_(None), Invoice.status.in_(INVOICE_WAITING_FINANCE_STATUSES)
        )
    )
    invoices_awaiting_payment = _count(
        scope_by_customer(db.query(func.count(Invoice.id)), Invoice.customer_id, user).filter(
            Invoice.deleted_at.is_(None), Invoice.status.in_(INVOICE_AWAITING_PAYMENT_STATUSES)
        )
    )
    invoices_paid = _count(
        scope_by_customer(db.query(func.count(Invoice.id)), Invoice.customer_id, user).filter(
            Invoice.deleted_at.is_(None),
            Invoice.status == "paid",
            Invoice.order.has(Order.status.in_(ACTIVE_ORDER_STATUSES)),
        )
    )

    items = _attention_items(db, user, today)
    result = {
        "scope": "own" if own else "all",
        "counts": {
            "customers": customers,
            "open_feasibility": open_feasibility,
            "open_quotations": open_quotations,
            "active_orders": active_orders,
            "invoices_waiting_finance": invoices_waiting_finance,
            "invoices_awaiting_payment": invoices_awaiting_payment,
            "invoices_paid_processing": invoices_paid,
            "attention": len(items),
        },
        "attention": [
            {k: item[k] for k in ("kind", "title", "detail", "customer_name", "link")}
            for item in items[:ATTENTION_LIST_LIMIT]
        ],
        "salesmen": [] if own else _salesman_workload(db, items),
    }
    return result


def _salesman_workload(db: Session, items: list[dict]) -> list[dict]:
    """Manager view: one row per Sales salesman (+ Unassigned) -- three
    grouped aggregates, the attention count taken from the item list."""

    def grouped(query, group_col):
        return {key: n for key, n in query.group_by(group_col).all()}

    customers_by = grouped(
        db.query(Customer.assigned_to, func.count(Customer.id)).filter(Customer.deleted_at.is_(None)),
        Customer.assigned_to,
    )
    quotes_by = grouped(
        db.query(Customer.assigned_to, func.count(Quotation.id))
        .join(Quotation, Quotation.customer_id == Customer.id)
        .filter(Quotation.deleted_at.is_(None), Quotation.status.in_(OPEN_QUOTATION_STATUSES)),
        Customer.assigned_to,
    )
    orders_by = grouped(
        db.query(Customer.assigned_to, func.count(Order.id))
        .join(Order, Order.customer_id == Customer.id)
        .filter(Order.deleted_at.is_(None), Order.status.in_(ACTIVE_ORDER_STATUSES)),
        Customer.assigned_to,
    )
    attention_by: dict[int | None, int] = {}
    for item in items:
        attention_by[item["assigned_to"]] = attention_by.get(item["assigned_to"], 0) + 1

    salesmen = list_salesmen(db)
    rows = [
        {
            "user_id": s.id,
            "name": s.full_name,
            "customers": customers_by.get(s.id, 0),
            "open_quotations": quotes_by.get(s.id, 0),
            "active_orders": orders_by.get(s.id, 0),
            "attention": attention_by.get(s.id, 0),
        }
        for s in salesmen
    ]
    unassigned = {
        "user_id": None,
        "name": "Unassigned",
        "customers": customers_by.get(None, 0),
        "open_quotations": quotes_by.get(None, 0),
        "active_orders": orders_by.get(None, 0),
        "attention": attention_by.get(None, 0),
    }
    if any(unassigned[k] for k in ("customers", "open_quotations", "active_orders", "attention")):
        rows.append(unassigned)
    return rows
