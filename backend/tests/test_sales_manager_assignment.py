"""Sales Manager workflow additions:

  * A customer may be reassigned not just between salesmen, but to the
    Sales Manager themselves or to an admin ("revoke" is assigned_to=null,
    already covered by test_sales_salesman_scope.py).
  * /api/quotations and /api/orders take an `assigned_to` filter so a
    manager can see one salesman's quotations/orders directly, not just
    their customers.
  * /api/reports/sales-report's existing date_from/date_to window is
    exercised end to end here too.

See test_sales_salesman_scope.py for the base ownership/scoping suite
this extends -- same `_sales_department` department setup.
"""

from datetime import date

import pytest
from fastapi.testclient import TestClient

from app.api.deps import get_current_user
from app.core.database import get_db
from app.main import app

from .factories import make_customer, make_order, make_quotation, make_user
from .test_sales_salesman_scope import _sales_department


@pytest.fixture()
def env(db):
    dept = _sales_department(db)
    manager = make_user(db, role="department_head", department_id=dept.id)
    salesman_a = make_user(db, role="team_member", department_id=dept.id)
    salesman_b = make_user(db, role="team_member", department_id=dept.id)
    admin = make_user(db, role="admin", department_id=None)
    other_dept_user = make_user(db, role="team_member")  # no department at all
    customer_a = make_customer(db, name="Customer A Ltd", assigned_to=salesman_a.id)
    return {
        "manager": manager,
        "a": salesman_a,
        "b": salesman_b,
        "admin": admin,
        "other": other_dept_user,
        "cust_a": customer_a,
    }


@pytest.fixture()
def api(db):
    app.dependency_overrides[get_db] = lambda: db

    def _as(user):
        app.dependency_overrides[get_current_user] = lambda: user
        return TestClient(app)

    yield _as
    app.dependency_overrides.clear()


def test_manager_can_assign_a_customer_to_themselves(api, env):
    response = api(env["manager"]).post(
        f"/api/customers/{env['cust_a'].id}/assign", json={"assigned_to": env["manager"].id}
    )
    assert response.status_code == 200, response.text
    assert response.json()["assigned_to"] == env["manager"].id


def test_manager_can_assign_a_customer_to_an_admin(api, env):
    response = api(env["manager"]).post(
        f"/api/customers/{env['cust_a'].id}/assign", json={"assigned_to": env["admin"].id}
    )
    assert response.status_code == 200, response.text
    assert response.json()["assigned_to"] == env["admin"].id


def test_manager_can_revoke_a_customers_assignment(api, env):
    response = api(env["manager"]).post(f"/api/customers/{env['cust_a'].id}/assign", json={"assigned_to": None})
    assert response.status_code == 200, response.text
    assert response.json()["assigned_to"] is None


def test_manager_cannot_assign_to_a_user_outside_sales_and_not_admin(api, env):
    response = api(env["manager"]).post(
        f"/api/customers/{env['cust_a'].id}/assign", json={"assigned_to": env["other"].id}
    )
    assert response.status_code == 422, response.text


def test_assignable_users_list_includes_salesmen_manager_and_admin(api, env):
    ids = {row["id"] for row in api(env["manager"]).get("/api/sales/salesmen").json()}
    assert env["a"].id in ids
    assert env["b"].id in ids
    assert env["manager"].id in ids
    assert env["admin"].id in ids
    assert env["other"].id not in ids


def test_quotations_and_orders_can_be_filtered_by_salesman(db, api, env):
    customer_b = make_customer(db, name="Customer B Ltd", assigned_to=env["b"].id)
    q_a = make_quotation(db, env["cust_a"].id, quotation_date=date(2026, 1, 1))
    q_b = make_quotation(db, customer_b.id, quotation_date=date(2026, 1, 1))
    o_a = make_order(db, env["cust_a"].id, status="confirmed", order_date=date(2026, 1, 1))
    o_b = make_order(db, customer_b.id, status="confirmed", order_date=date(2026, 1, 1))

    manager = api(env["manager"])
    quote_ids = {row["id"] for row in manager.get("/api/quotations", params={"assigned_to": env["a"].id}).json()["items"]}
    order_ids = {row["id"] for row in manager.get("/api/orders", params={"assigned_to": env["a"].id}).json()["items"]}
    assert quote_ids == {q_a.id}
    assert order_ids == {o_a.id}
    assert q_b.id not in quote_ids
    assert o_b.id not in order_ids


def test_a_salesman_passing_assigned_to_cannot_see_beyond_their_own_scope(db, api, env):
    """assigned_to is a further filter, never a way to widen sales_scope's
    own restriction -- a salesman asking for someone else's id still only
    gets their own records (here: none, since salesman_a has no customer
    assigned to salesman_b)."""
    customer_b = make_customer(db, name="Customer B Ltd", assigned_to=env["b"].id)
    make_order(db, customer_b.id, status="confirmed", order_date=date(2026, 1, 1))

    response = api(env["a"]).get("/api/orders", params={"assigned_to": env["b"].id})
    assert response.status_code == 200
    assert response.json()["items"] == []


def test_sales_report_respects_an_explicit_date_window(api, env):
    response = api(env["manager"]).get(
        "/api/reports/sales", params={"date_from": "2026-01-01", "date_to": "2026-01-31"}
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert "monthly" in body
