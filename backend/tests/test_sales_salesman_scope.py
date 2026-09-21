"""Sales spec section 16 -- the mandatory acceptance test for salesman
customer ownership, exercised through the real HTTP API (FastAPI's
TestClient, with only authentication and the DB session swapped for the
test's own) so every router-level guard, list filter and body check is
covered end to end -- not just the service functions underneath.

    Customer A -> Salesman A          Customer B -> Salesman B

  * Salesman A sees Customer A and A's feasibility/quotation/order/
    delivery data -- and nothing of B's: not in lists, search, dashboard,
    reports, notifications, the collection queue, by direct URL, or by
    creating records against B's customer.
  * Salesman B is the same in reverse.
  * The Sales Manager sees both, reassigns A -> B, A loses access, B
    gains it, the manager keeps it.
  * Other departments' users and admin are NOT scoped.
"""

from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app.api.deps import get_current_user
from app.core.database import get_db
from app.core.timezone import today_kuwait
from app.main import app
from app.models.department import Department
from app.models.department_permission import DepartmentPermission
from app.models.feasibility import FeasibilityCheck
from app.models.quotation import Quotation

from .factories import (
    _n,
    make_customer,
    make_delivery_note,
    make_department,
    make_order,
    make_product,
    make_user,
)

# Dated relative to today so the fixtures never age out of the report window
# or turn "overdue" into "not yet due" -- 40 days back is past any default terms.
ORDER_DATE = today_kuwait() - timedelta(days=40)

SALES_PAGES = ("dashboard", "customers", "deals", "feasibilities", "quotations", "orders", "delivery_notes", "payments")


def _sales_department(db):
    dept = db.query(Department).filter(Department.code == "sales").first() or make_department(db, code="sales")
    granted = {p.page_key for p in db.query(DepartmentPermission).filter(DepartmentPermission.department_id == dept.id)}
    for page in SALES_PAGES:
        if page in granted:
            db.query(DepartmentPermission).filter(
                DepartmentPermission.department_id == dept.id, DepartmentPermission.page_key == page
            ).update({"access_level": "write"})
        else:
            db.add(DepartmentPermission(department_id=dept.id, page_key=page, access_level="write"))
    db.flush()
    return dept


def _records_for(db, customer):
    """One feasibility check, quotation, order (confirmed, flagged for admin
    review) and delivery note for `customer`."""
    n = _n()
    feasibility = FeasibilityCheck(
        feasibility_number=f"TESTFEAS-{n}",
        customer_id=customer.id,
        required_by_date=today_kuwait() + timedelta(days=90),
        status="exception_pending",
        checked_at=datetime.now(),
    )
    quotation = Quotation(
        quotation_number=f"TESTQ-{n}", customer_id=customer.id, quotation_date=today_kuwait()
    )
    db.add_all([feasibility, quotation])
    db.flush()
    order = make_order(
        db, customer.id, status="confirmed", admin_review_required=True, order_date=ORDER_DATE
    )
    note = make_delivery_note(db, order.id)
    return {"feasibility": feasibility, "quotation": quotation, "order": order, "note": note}


@pytest.fixture()
def env(db):
    dept = _sales_department(db)
    manager = make_user(db, role="department_head", department_id=dept.id)
    salesman_a = make_user(db, role="team_member", department_id=dept.id)
    salesman_b = make_user(db, role="team_member", department_id=dept.id)
    admin = make_user(db, role="admin", department_id=None)
    customer_a = make_customer(db, name="Customer A Ltd", created_by=manager.id, assigned_to=salesman_a.id)
    customer_b = make_customer(db, name="Customer B Ltd", created_by=manager.id, assigned_to=salesman_b.id)
    return {
        "dept": dept,
        "manager": manager,
        "a": salesman_a,
        "b": salesman_b,
        "admin": admin,
        "cust_a": customer_a,
        "cust_b": customer_b,
        "rec_a": _records_for(db, customer_a),
        "rec_b": _records_for(db, customer_b),
    }


@pytest.fixture()
def api(db):
    """api(user) -> a TestClient authenticated as `user`, on the test's own
    transaction-wrapped session."""
    app.dependency_overrides[get_db] = lambda: db
    clients = []

    def _as(user):
        app.dependency_overrides[get_current_user] = lambda: user
        client = TestClient(app)
        clients.append(client)
        return client

    yield _as
    app.dependency_overrides.clear()


def _ids(response):
    assert response.status_code == 200, response.text
    return {row["id"] for row in response.json()["items"]}


# ---------------------------------------------------------------------
# Salesman A: sees A, and nothing of B
# ---------------------------------------------------------------------


def test_salesman_a_sees_customer_a_but_not_customer_b_in_lists_and_search(env, api):
    client = api(env["a"])

    assert env["cust_a"].id in _ids(client.get("/api/customers"))
    assert env["cust_b"].id not in _ids(client.get("/api/customers"))
    assert _ids(client.get("/api/customers", params={"search": "Customer B"})) == set()  # search / autocomplete
    assert env["cust_a"].id in _ids(client.get("/api/customers", params={"search": "Customer A"}))

    assert _ids(client.get("/api/orders")) == {env["rec_a"]["order"].id}
    assert _ids(client.get("/api/quotations")) == {env["rec_a"]["quotation"].id}
    assert _ids(client.get("/api/feasibility")) == {env["rec_a"]["feasibility"].id}
    assert _ids(client.get("/api/delivery-notes")) == {env["rec_a"]["note"].id}
    # dropdown-style helper and a forged customer_id filter can't widen it
    assert client.get("/api/feasibility/available/for-quotation").status_code == 200
    assert _ids(client.get("/api/orders", params={"customer_id": env["cust_b"].id})) == set()


def test_salesman_a_cannot_open_customer_b_or_any_of_bs_records_by_url(env, api):
    client = api(env["a"])
    rec = env["rec_b"]
    b_urls = [
        f"/api/customers/{env['cust_b'].id}",
        f"/api/customers/{env['cust_b'].id}/credit",
        f"/api/orders/{rec['order'].id}",
        f"/api/orders/{rec['order'].id}/fulfillment",
        f"/api/orders/{rec['order'].id}/journey",
        f"/api/orders/{rec['order'].id}/history",
        f"/api/orders/{rec['order'].id}/payments",
        f"/api/orders/{rec['order'].id}/payments/status",
        f"/api/orders/{rec['order'].id}/payment-plans",
        f"/api/quotations/{rec['quotation'].id}",
        f"/api/quotations/{rec['quotation'].id}/history",
        f"/api/feasibility/{rec['feasibility'].id}",
        f"/api/delivery-notes/{rec['note'].id}",
    ]
    for url in b_urls:
        assert client.get(url).status_code == 404, url

    # ...and write actions on them are refused just the same
    write_attempts = [
        ("post", f"/api/orders/{rec['order'].id}/status", {"status": "cancelled", "reason": "x"}),
        ("post", f"/api/orders/{rec['order'].id}/approve", None),
        ("post", f"/api/quotations/{rec['quotation'].id}/follow-up", {}),
        ("post", f"/api/feasibility/{rec['feasibility'].id}/run", None),
        ("post", f"/api/delivery-notes/{rec['note'].id}/status", {"status": "issued"}),
        ("delete", f"/api/orders/{rec['order'].id}", None),
    ]
    for method, url, body in write_attempts:
        response = getattr(client, method)(url, json=body) if body is not None else getattr(client, method)(url)
        assert response.status_code == 404, (method, url, response.text)

    # and A's own records still open fine
    assert client.get(f"/api/orders/{env['rec_a']['order'].id}").status_code == 200
    assert client.get(f"/api/quotations/{env['rec_a']['quotation'].id}").status_code == 200
    assert client.get(f"/api/feasibility/{env['rec_a']['feasibility'].id}").status_code == 200
    assert client.get(f"/api/delivery-notes/{env['rec_a']['note'].id}").status_code == 200
    assert client.get(f"/api/customers/{env['cust_a'].id}").status_code == 200


def test_salesman_a_cannot_create_records_against_customer_b(env, api, db):
    client = api(env["a"])
    product = make_product(db)
    line = {"product_id": product.id, "quantity": 1, "unit_price": 5}
    cust_b = env["cust_b"].id

    attempts = [
        ("/api/orders", {"customer_id": cust_b, "order_date": today_kuwait().isoformat(), "lines": [line]}),
        ("/api/orders/log", {"customer_id": cust_b, "lines": [line]}),
        (
            "/api/quotations",
            {"customer_id": cust_b, "quotation_date": today_kuwait().isoformat(), "language": "en", "lines": [line]},
        ),
        (
            "/api/feasibility",
            {"customer_id": cust_b, "required_by_date": (today_kuwait() + timedelta(days=90)).isoformat(), "lines": [{"product_id": product.id, "quantity": 1}]},
        ),
        ("/api/delivery-notes", {"order_id": env["rec_b"]["order"].id, "delivery_date": today_kuwait().isoformat()}),
        (f"/api/orders/from-quotation/{env['rec_b']['quotation'].id}", None),
    ]
    for url, body in attempts:
        response = client.post(url, json=body) if body is not None else client.post(url)
        assert response.status_code == 404, (url, response.status_code, response.text)


def test_salesman_a_cannot_repoint_their_own_order_at_customer_b(env, api):
    response = api(env["a"]).put(
        f"/api/orders/{env['rec_a']['order'].id}", json={"customer_id": env["cust_b"].id}
    )
    assert response.status_code == 404, response.text


def test_salesman_a_global_search_never_reveals_bs_data(env, api):
    client = api(env["a"])
    b_order = env["rec_b"]["order"].order_number
    b_quote = env["rec_b"]["quotation"].quotation_number

    def hits(q):
        response = client.get("/api/search", params={"q": q})
        assert response.status_code == 200, response.text
        return {(r["entity"], r["id"]) for r in response.json()}

    assert ("orders", env["rec_b"]["order"].id) not in hits(b_order)
    assert ("quotations", env["rec_b"]["quotation"].id) not in hits(b_quote)
    assert ("customers", env["cust_b"].id) not in hits("Customer B")
    assert ("customers", env["cust_a"].id) in hits("Customer A")  # own data still found


def test_salesman_a_dashboard_reports_notifications_and_collections_are_only_as_scope(env, api):
    client = api(env["a"])

    # Dashboard counts: A's one order this month, not two.
    stats = client.get("/api/dashboard/stats")
    assert stats.status_code == 200, stats.text
    assert stats.json()["stats"]["orders_month"]["value"] == 1
    assert stats.json()["stats"]["quotations_month"]["value"] == 1
    assert stats.json()["stats"]["customers_month"]["value"] == 1

    # Sales report: only A's customer can appear in top customers / drilldown.
    report = client.get("/api/reports/sales")
    assert report.status_code == 200, report.text
    assert {c["customer_id"] for c in report.json()["top_customers"]} <= {env["cust_a"].id}
    drill = client.get("/api/reports/sales/drilldown", params={"status": "confirmed"})
    assert drill.status_code == 200, drill.text
    assert {row["id"] for row in drill.json()["items"]} == {env["rec_a"]["order"].id}

    # Notifications: A is told about their own feasibility awaiting a Sales
    # decision, never about B's.
    notification_ids = {n["id"] for n in client.get("/api/notifications").json()["items"]}
    assert f"feasibility-exception-{env['rec_a']['feasibility'].id}" in notification_ids
    assert f"feasibility-exception-{env['rec_b']['feasibility'].id}" not in notification_ids
    manager_ids = {n["id"] for n in api(env["manager"]).get("/api/notifications").json()["items"]}
    assert {
        f"feasibility-exception-{env['rec_a']['feasibility'].id}",
        f"feasibility-exception-{env['rec_b']['feasibility'].id}",
    } <= manager_ids
    client = api(env["a"])

    # Collection queue: A's overdue balance only.
    queue = client.get("/api/collection-queue")
    assert queue.status_code == 200, queue.text
    manager_queue = {row["customer_id"] for row in api(env["manager"]).get("/api/collection-queue").json()}
    assert {env["cust_a"].id, env["cust_b"].id} <= manager_queue  # the fixture data really is overdue
    assert {row["customer_id"] for row in queue.json()} == {env["cust_a"].id}
    client = api(env["a"])

    # Calendar day snapshot lists only A's orders for the day.
    snapshot = client.get("/api/calendar/day-snapshot", params={"date": ORDER_DATE.isoformat()})
    assert snapshot.status_code == 200, snapshot.text
    assert {s["id"] for s in snapshot.json()["sales"]} == {env["rec_a"]["order"].id}


# ---------------------------------------------------------------------
# Salesman B: the same isolation in reverse
# ---------------------------------------------------------------------


def test_salesman_b_is_isolated_in_reverse(env, api):
    client = api(env["b"])

    assert _ids(client.get("/api/customers")) >= {env["cust_b"].id}
    assert env["cust_a"].id not in _ids(client.get("/api/customers"))
    assert _ids(client.get("/api/orders")) == {env["rec_b"]["order"].id}
    assert _ids(client.get("/api/quotations")) == {env["rec_b"]["quotation"].id}
    assert _ids(client.get("/api/feasibility")) == {env["rec_b"]["feasibility"].id}
    assert _ids(client.get("/api/delivery-notes")) == {env["rec_b"]["note"].id}

    assert client.get(f"/api/customers/{env['cust_a'].id}").status_code == 404
    assert client.get(f"/api/orders/{env['rec_a']['order'].id}").status_code == 404
    assert client.get(f"/api/quotations/{env['rec_a']['quotation'].id}").status_code == 404
    assert client.get(f"/api/feasibility/{env['rec_a']['feasibility'].id}").status_code == 404
    assert client.get(f"/api/delivery-notes/{env['rec_a']['note'].id}").status_code == 404
    assert client.get("/api/dashboard/stats").json()["stats"]["orders_month"]["value"] == 1


# ---------------------------------------------------------------------
# Manager: sees both, reassigns; access follows the assignment
# ---------------------------------------------------------------------


def test_manager_sees_both_reassigns_a_to_b_and_access_follows(env, api):
    manager = api(env["manager"])
    a_order, b_order = env["rec_a"]["order"].id, env["rec_b"]["order"].id

    # Manager sees everything
    assert {a_order, b_order} <= _ids(manager.get("/api/orders"))
    assert {env["cust_a"].id, env["cust_b"].id} <= _ids(manager.get("/api/customers"))
    assert manager.get("/api/dashboard/stats").json()["stats"]["orders_month"]["value"] >= 2

    # Before: A has Customer A, B does not
    assert api(env["a"]).get(f"/api/customers/{env['cust_a'].id}").status_code == 200
    assert api(env["b"]).get(f"/api/customers/{env['cust_a'].id}").status_code == 404

    # Manager reassigns Customer A -> Salesman B
    response = api(env["manager"]).post(f"/api/customers/{env['cust_a'].id}/assign", json={"assigned_to": env["b"].id})
    assert response.status_code == 200, response.text

    # After: Salesman A loses access to the customer AND all its records...
    client_a = api(env["a"])
    assert client_a.get(f"/api/customers/{env['cust_a'].id}").status_code == 404
    assert client_a.get(f"/api/orders/{a_order}").status_code == 404
    assert client_a.get(f"/api/quotations/{env['rec_a']['quotation'].id}").status_code == 404
    assert a_order not in _ids(client_a.get("/api/orders"))
    # ...Salesman B gains all of it...
    client_b = api(env["b"])
    assert client_b.get(f"/api/customers/{env['cust_a'].id}").status_code == 200
    assert client_b.get(f"/api/orders/{a_order}").status_code == 200
    assert {a_order, b_order} <= _ids(client_b.get("/api/orders"))
    # ...and the manager retains it.
    assert api(env["manager"]).get(f"/api/orders/{a_order}").status_code == 200


def test_a_salesman_cannot_reassign_customers(env, api):
    response = api(env["a"]).post(f"/api/customers/{env['cust_a'].id}/assign", json={"assigned_to": env["b"].id})
    assert response.status_code == 403, response.text


def test_admin_and_other_departments_are_not_scoped(env, api, db):
    assert {env["rec_a"]["order"].id, env["rec_b"]["order"].id} <= _ids(api(env["admin"]).get("/api/orders"))

    # A Warehouse team_member must still see every salesman's delivery notes
    # and orders (they deliver them) -- scoping is a Sales-department rule.
    warehouse = db.query(Department).filter(Department.code == "warehouse").first() or make_department(db, code="warehouse")
    for page in ("orders", "delivery_notes"):
        if not db.query(DepartmentPermission).filter_by(department_id=warehouse.id, page_key=page).first():
            db.add(DepartmentPermission(department_id=warehouse.id, page_key=page, access_level="read"))
        else:
            db.query(DepartmentPermission).filter_by(department_id=warehouse.id, page_key=page).update({"access_level": "read"})
    db.flush()
    warehouse_user = make_user(db, role="team_member", department_id=warehouse.id)
    client = api(warehouse_user)
    assert {env["rec_a"]["order"].id, env["rec_b"]["order"].id} <= _ids(client.get("/api/orders"))
    assert {env["rec_a"]["note"].id, env["rec_b"]["note"].id} <= _ids(client.get("/api/delivery-notes"))


# ---------------------------------------------------------------------
# Sales Home (/api/sales/home): scoped counts, next actions, manager table
# ---------------------------------------------------------------------


def test_sales_home_is_scoped_for_a_salesman_and_department_wide_for_the_manager(env, api):
    a_home = api(env["a"]).get("/api/sales/home")
    assert a_home.status_code == 200, a_home.text
    body = a_home.json()
    assert body["scope"] == "own"
    assert body["salesmen"] == []  # a salesman never sees the workload table
    assert body["counts"]["customers"] == 1
    assert body["counts"]["active_orders"] == 1
    assert body["counts"]["open_quotations"] == 1
    assert body["counts"]["open_feasibility"] == 1
    # A's next actions mention A's records only.
    links = {item["link"] for item in body["attention"]}
    assert f"/feasibilities/{env['rec_a']['feasibility'].id}" in links  # exception decision needed
    assert f"/feasibilities/{env['rec_b']['feasibility'].id}" not in links
    assert all(item["customer_name"] == "Customer A Ltd" for item in body["attention"])

    m_home = api(env["manager"]).get("/api/sales/home").json()
    assert m_home["scope"] == "all"
    assert m_home["counts"]["customers"] >= 2
    rows = {row["user_id"]: row for row in m_home["salesmen"]}
    assert rows[env["a"].id]["customers"] == 1 and rows[env["a"].id]["active_orders"] == 1
    assert rows[env["b"].id]["customers"] == 1 and rows[env["b"].id]["active_orders"] == 1
    assert rows[env["a"].id]["attention"] >= 1
    assert env["manager"].id not in rows  # the manager isn't a row in their own workload table


def test_sales_home_workload_follows_a_reassignment(env, api):
    api(env["manager"]).post(f"/api/customers/{env['cust_a'].id}/assign", json={"assigned_to": env["b"].id})
    rows = {row["user_id"]: row for row in api(env["manager"]).get("/api/sales/home").json()["salesmen"]}
    assert rows[env["a"].id]["customers"] == 0 and rows[env["a"].id]["active_orders"] == 0
    assert rows[env["b"].id]["customers"] == 2 and rows[env["b"].id]["active_orders"] == 2
    assert api(env["a"]).get("/api/sales/home").json()["counts"]["customers"] == 0


# ---------------------------------------------------------------------
# Assigning customers (Pass 4): the manager can actually do it
# ---------------------------------------------------------------------


def test_manager_can_list_assignable_salesmen_but_a_salesman_cannot(env, api):
    response = api(env["manager"]).get("/api/sales/salesmen")
    assert response.status_code == 200, response.text
    ids = {row["id"] for row in response.json()}
    assert {env["a"].id, env["b"].id} <= ids
    assert env["manager"].id not in ids and env["admin"].id not in ids  # salesmen only

    assert api(env["a"]).get("/api/sales/salesmen").status_code == 403


def test_customers_can_only_be_assigned_to_sales_salesmen(env, api, db):
    warehouse = db.query(Department).filter(Department.code == "warehouse").first() or make_department(db, code="warehouse")
    outsider = make_user(db, role="team_member", department_id=warehouse.id)

    response = api(env["manager"]).post(f"/api/customers/{env['cust_a'].id}/assign", json={"assigned_to": outsider.id})
    assert response.status_code == 422, response.text

    # unassigning stays allowed
    assert api(env["manager"]).post(f"/api/customers/{env['cust_a'].id}/assign", json={"assigned_to": None}).status_code == 200


def test_customer_payload_names_its_salesman_and_the_list_filters_by_assignee(env, api):
    manager = api(env["manager"])
    detail = manager.get(f"/api/customers/{env['cust_a'].id}").json()
    assert detail["assigned_to"] == env["a"].id
    assert detail["assigned_to_name"] == env["a"].full_name  # no /api/users lookup needed

    mine = _ids(manager.get("/api/customers", params={"assigned_to": env["a"].id}))
    assert env["cust_a"].id in mine and env["cust_b"].id not in mine
    manager.post(f"/api/customers/{env['cust_b'].id}/assign", json={"assigned_to": None})
    unassigned = _ids(manager.get("/api/customers", params={"assigned_to": "null"}))
    assert env["cust_b"].id in unassigned and env["cust_a"].id not in unassigned


def test_customer_payload_names_buyer_and_followup_owner_without_the_admin_only_user_list(env, api, db):
    """The customer page used to resolve these from GET /api/users
    (admin-only), so the Sales Manager and salesmen saw 'User #12'."""
    env["cust_a"].buyer_id = env["b"].id
    env["cust_a"].followup_responsible_id = env["manager"].id
    db.flush()
    db.expire(env["cust_a"])

    for viewer in (env["manager"], env["a"]):
        body = api(viewer).get(f"/api/customers/{env['cust_a'].id}").json()
        assert body["buyer_name"] == env["b"].full_name
        assert body["followup_responsible_name"] == env["manager"].full_name
