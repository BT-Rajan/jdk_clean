"""Salesman-level ownership scoping for the Sales module.

The rule (Sales spec section 2): a Salesman -- a 'team_member' of the Sales
department -- sees ONLY the customers currently assigned to them
(customers.assigned_to), and through those customers only their feasibility
checks, quotations, orders, delivery notes, payments and deals. Everyone
else is untouched: admin, department_head (the Sales Manager) and every
other department's users see whatever their page-level access already
allowed. That's deliberate -- Warehouse, Production and Finance staff work
on other salesmen's orders every day (deliveries, batches, collections)
and must not be cut off from them.

Enforced server-side, in three complementary places so a missed endpoint
can't open a hole:
  * `sales_record_scope_guard` (app/api/sales_scope_guard.py) -- a router-level dependency that resolves
    any {order_id}/{quotation_id}/{feasibility_id}/{note_id}/{deal_id}
    path parameter to its customer and 404s when it's out of scope (404,
    not 403, so another salesman's record IDs can't even be probed).
  * `scope_by_customer` -- applied to every list/aggregate query.
  * `assert_customer_in_scope` -- applied where a request *names* a
    customer (creating or re-pointing a record) or an order.

Pure helpers with no FastAPI import so services can use them without an
import cycle; the router-level dependency itself lives in
app/api/sales_scope_guard.py.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError
from app.core.permissions import is_team_member
from app.models.customer import Customer
from app.models.user import User

SALES_DEPARTMENT_CODE = "sales"


def is_scoped_salesman(user: User | None) -> bool:
    """True for a team_member (or legacy 'staff') of the Sales department --
    the only users whose Sales data is restricted to their own customers."""
    return user is not None and is_team_member(user) and user.department_code == SALES_DEPARTMENT_CODE


def visible_customer_ids(user: User):
    """SELECT of the customer ids this salesman may see. Assignment only:
    once a customer is reassigned, the previous salesman loses access even
    if they created it (created_by is history, not ownership)."""
    return select(Customer.id).where(Customer.assigned_to == user.id, Customer.deleted_at.is_(None))


def scope_by_customer(query, customer_column, user: User | None):
    """Restrict `query` to rows whose `customer_column` is one of the
    salesman's customers. No-op for everyone who isn't a scoped salesman
    (including user=None, the 'internal caller, already authorised'
    convention BaseCRUD uses)."""
    if not is_scoped_salesman(user):
        return query
    return query.filter(customer_column.in_(visible_customer_ids(user)))


def customer_scope_filters(customer_column, user: User | None) -> list:
    """The same restriction as scope_by_customer, as a list of filter
    clauses ([] for unscoped users) -- for aggregate queries assembled
    with .filter(...) mid-chain, where wrapping the whole query is awkward."""
    if not is_scoped_salesman(user):
        return []
    return [customer_column.in_(visible_customer_ids(user))]


def scope_customer_rows(query, user: User | None):
    """Restrict a query over the Customer table itself to the salesman's
    own customers (assignment only)."""
    if not is_scoped_salesman(user):
        return query
    return query.filter(Customer.assigned_to == user.id, Customer.deleted_at.is_(None))


def order_scope_filters(order_id_column, user: User | None) -> list:
    """Filter clauses restricting rows keyed by an order id (delivery
    notes) to orders of the salesman's own customers."""
    if not is_scoped_salesman(user):
        return []
    from app.models.order import Order

    return [order_id_column.in_(select(Order.id).where(Order.customer_id.in_(visible_customer_ids(user))))]


def customer_in_scope(db: Session, user: User | None, customer_id: int | None) -> bool:
    if not is_scoped_salesman(user):
        return True
    if customer_id is None:
        return False
    return db.execute(visible_customer_ids(user).where(Customer.id == customer_id)).first() is not None


def assert_customer_in_scope(db: Session, user: User | None, customer_id: int | None, resource: str = "Customer") -> None:
    if not customer_in_scope(db, user, customer_id):
        raise NotFoundError(resource)


def customer_of_order(db: Session, order_id: int) -> int | None:
    from app.models.order import Order

    return db.query(Order.customer_id).filter(Order.id == order_id).scalar()


def customer_of_quotation(db: Session, quotation_id: int) -> int | None:
    from app.models.quotation import Quotation

    return db.query(Quotation.customer_id).filter(Quotation.id == quotation_id).scalar()


def customer_of_feasibility(db: Session, feasibility_id: int) -> int | None:
    from app.models.feasibility import FeasibilityCheck

    return db.query(FeasibilityCheck.customer_id).filter(FeasibilityCheck.id == feasibility_id).scalar()


def customer_of_delivery_note(db: Session, note_id: int) -> int | None:
    from app.models.delivery_note import DeliveryNote
    from app.models.order import Order

    return (
        db.query(Order.customer_id)
        .join(DeliveryNote, DeliveryNote.order_id == Order.id)
        .filter(DeliveryNote.id == note_id)
        .scalar()
    )


def customer_of_deal(db: Session, deal_id: int) -> int | None:
    from app.models.deal import Deal

    return db.query(Deal.customer_id).filter(Deal.id == deal_id).scalar()


def customer_of_invoice(db: Session, invoice_id: int) -> int | None:
    from app.models.invoice import Invoice

    return db.query(Invoice.customer_id).filter(Invoice.id == invoice_id).scalar()


# path-parameter name -> (resolver, resource label for the 404). Soft-deleted
# rows are resolved too so restore endpoints are covered.
PATH_PARAM_RESOLVERS = {
    "order_id": (customer_of_order, "Order"),
    "quotation_id": (customer_of_quotation, "Quotation"),
    "feasibility_id": (customer_of_feasibility, "Feasibility check"),
    "note_id": (customer_of_delivery_note, "Delivery note"),
    "deal_id": (customer_of_deal, "Deal"),
    "invoice_id": (customer_of_invoice, "Invoice"),
}
