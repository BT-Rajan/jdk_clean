"""Invoice scoping -- Invoice reuses the exact same sales_scope machinery
as Order/Quotation/Feasibility (see app/core/sales_scope.py's
PATH_PARAM_RESOLVERS and app/api/invoices.py's read_guard/finance_guard),
so this mirrors test_sales_salesman_scope.py's pattern rather than
inventing a new one: a scoped salesman only sees invoices for their own
customers, the Sales Manager sees the whole department, and only a
"payments" write holder (Finance) sees the payment link/QR fields at all.
"""

from datetime import date

import pytest
from fastapi.testclient import TestClient

from app.api.deps import get_current_user
from app.core.database import get_db
from app.main import app
from app.models.department import Department
from app.models.department_permission import DepartmentPermission

from .factories import make_customer, make_department, make_invoice, make_order, make_user


def _grant(db, dept, page_key, level="write"):
    existing = (
        db.query(DepartmentPermission)
        .filter(DepartmentPermission.department_id == dept.id, DepartmentPermission.page_key == page_key)
        .first()
    )
    if existing:
        existing.access_level = level
    else:
        db.add(DepartmentPermission(department_id=dept.id, page_key=page_key, access_level=level))
    db.flush()


def _sales_dept_orders_only(db):
    """Sales, granted 'orders' write but deliberately NOT 'payments' --
    a plain salesman/manager must never see an invoice's payment link."""
    dept = db.query(Department).filter(Department.code == "sales").first() or make_department(db, code="sales")
    _grant(db, dept, "orders", "write")
    return dept


def _finance_dept(db):
    dept = db.query(Department).filter(Department.code == "finance").first() or make_department(db, code="finance")
    _grant(db, dept, "orders", "read")
    _grant(db, dept, "payments", "write")
    return dept


@pytest.fixture()
def env(db):
    sales = _sales_dept_orders_only(db)
    finance = _finance_dept(db)
    manager = make_user(db, role="department_head", department_id=sales.id)
    salesman_a = make_user(db, role="team_member", department_id=sales.id)
    salesman_b = make_user(db, role="team_member", department_id=sales.id)
    finance_user = make_user(db, role="team_member", department_id=finance.id)
    customer_a = make_customer(db, name="Customer A Ltd", assigned_to=salesman_a.id)
    customer_b = make_customer(db, name="Customer B Ltd", assigned_to=salesman_b.id)
    order_a = make_order(db, customer_a.id, status="confirmed", order_date=date(2026, 1, 1))
    order_b = make_order(db, customer_b.id, status="confirmed", order_date=date(2026, 1, 1))
    invoice_a = make_invoice(db, order_a.id, customer_a.id)
    invoice_b = make_invoice(db, order_b.id, customer_b.id)
    return {
        "manager": manager,
        "a": salesman_a,
        "b": salesman_b,
        "finance": finance_user,
        "cust_a": customer_a,
        "cust_b": customer_b,
        "invoice_a": invoice_a,
        "invoice_b": invoice_b,
    }


@pytest.fixture()
def api(db):
    app.dependency_overrides[get_db] = lambda: db

    def _as(user):
        app.dependency_overrides[get_current_user] = lambda: user
        return TestClient(app)

    yield _as
    app.dependency_overrides.clear()


def test_salesman_sees_only_their_own_customers_invoice(api, env):
    a = api(env["a"])
    ids = {row["id"] for row in a.get("/api/invoices", params={"page_size": 200}).json()["items"]}
    assert env["invoice_a"].id in ids
    assert env["invoice_b"].id not in ids


def test_salesman_b_gets_404_on_salesman_a_invoice_by_id(api, env):
    b = api(env["b"])
    assert b.get(f"/api/invoices/{env['invoice_a'].id}").status_code == 404


def test_manager_sees_both_salesmen_invoices(api, env):
    manager = api(env["manager"])
    ids = {row["id"] for row in manager.get("/api/invoices", params={"page_size": 200}).json()["items"]}
    assert {env["invoice_a"].id, env["invoice_b"].id} <= ids


def test_reassignment_moves_invoice_access(db, api, env):
    """visible_customer_ids() is a live query -- see sales_scope.py's own
    docstring -- so reassigning the customer moves access immediately,
    with no separate invoice-specific step.

    Each api(user) call mutates the app's shared dependency_overrides, so
    -- same as test_sales_salesman_scope.py's own reassignment test --
    a client must be fully used before the next one is created, never
    both created up front."""
    env["cust_a"].assigned_to = env["b"].id
    db.flush()

    assert api(env["a"]).get(f"/api/invoices/{env['invoice_a'].id}").status_code == 404
    assert api(env["b"]).get(f"/api/invoices/{env['invoice_a'].id}").status_code == 200


def test_salesman_never_sees_payment_link_fields(api, env):
    a = api(env["a"])
    body = a.get(f"/api/invoices/{env['invoice_a'].id}").json()
    assert "payment_link_url" not in body
    assert "qr_data_url" not in body
    assert body["status"] == "waiting_finance"


def test_finance_sees_payment_link_fields(api, env):
    finance = api(env["finance"])
    body = finance.get(f"/api/invoices/{env['invoice_a'].id}").json()
    assert "payment_link_url" in body
    assert "qr_data_url" in body


def test_salesman_cannot_generate_payment_link(api, env):
    a = api(env["a"])
    response = a.post(f"/api/invoices/{env['invoice_a'].id}/generate-link")
    assert response.status_code == 403


def test_salesman_cannot_void_invoice(api, env):
    a = api(env["a"])
    response = a.post(f"/api/invoices/{env['invoice_a'].id}/void", json={"reason": "test"})
    assert response.status_code == 403


def test_finance_can_void_invoice(api, env):
    finance = api(env["finance"])
    response = finance.post(f"/api/invoices/{env['invoice_a'].id}/void", json={"reason": "customer withdrew"})
    body = response.json()
    assert response.status_code == 200, body
    assert body["status"] == "voided"
    assert body["voided_reason"] == "customer withdrew"
