"""Sales spec section 16 -- the mandatory end-to-end acceptance run.

The chain, driven through the real HTTP API as the people who own each
step (Salesman A / Manager / Admin for Sales; Production and QC act
through their own services, since they're other departments' screens):

    Customer -> Feasibility -> Quotation -> Sales Order
             -> existing FG allocated first
             -> production ONLY for the shortage
             -> QC -> released FG
             -> partial delivery, then the rest -> Delivered

Salesman B is checked at every stage: none of it may be visible to him.
Complements test_sales_salesman_scope.py (isolation / reassignment).
"""

from datetime import datetime, time, timedelta

import pytest
from fastapi.testclient import TestClient

from app.api.deps import get_current_user
from app.core.database import get_db
from app.core.timezone import today_kuwait
from app.main import app
from app.models.production_schedule import ProductionSchedule
from app.services import (
    inventory_service,
    production_execution_service,
    production_order_material_service,
    production_order_schedule_service,
    production_order_service,
    qc_service,
    settings_service,
)

from .factories import (
    make_bom,
    make_bom_line,
    make_customer,
    make_machine,
    make_product,
    make_qc_agent,
    make_raw_material,
    make_user,
    set_product_stock,
    set_stock,
)
from .test_sales_salesman_scope import _sales_department

DUE = today_kuwait() + timedelta(days=60)


def _at(days_ahead):
    """8am on a day `days_ahead` from today -- never a hard-coded date, so this
    can't age into 'the past' and start failing."""
    return datetime.combine(today_kuwait() + timedelta(days=days_ahead), time(8, 0))


@pytest.fixture()
def world(db):
    dept = _sales_department(db)
    people = {
        "manager": make_user(db, role="department_head", department_id=dept.id),
        "a": make_user(db, role="team_member", department_id=dept.id),
        "b": make_user(db, role="team_member", department_id=dept.id),
        "admin": make_user(db, role="admin", department_id=None),
    }
    # Cash customers: this run is about the sales-to-delivery chain, not
    # credit-limit gating (covered elsewhere).
    customer_a = make_customer(db, name="Customer A Ltd", assigned_to=people["a"].id, payment_terms_type="cash")
    return {**people, "cust_a": customer_a}


@pytest.fixture()
def api(db):
    app.dependency_overrides[get_db] = lambda: db

    def _as(user):
        app.dependency_overrides[get_current_user] = lambda: user
        return TestClient(app)

    yield _as
    app.dependency_overrides.clear()


def _product(db, fg_on_hand):
    """A producible product: machine + time formula, a BOM whose material is
    plentiful, and `fg_on_hand` released finished goods already on the shelf."""
    machine = make_machine(db)
    material = make_raw_material(db)
    product = make_product(db, machine_id=machine.id, production_hours_per_unit=0.001, selling_price=10)
    make_bom(db, product.id, output_quantity=1)
    make_bom_line(db, product.id, "raw_material", material.id, quantity=1, scrap_percent=0)
    set_stock(db, material.id, 10_000_000)
    set_product_stock(db, product.id, quantity_on_hand=fg_on_hand)
    return product, machine


def _ok(response, expected=(200, 201)):
    assert response.status_code in expected, f"{response.request.method} {response.request.url}: {response.status_code} {response.text}"
    return response.json()


def _sales_chain_to_confirmed_order(api, world, product, quantity):
    """Customer -> Feasibility -> Quotation -> accepted -> Order -> confirmed,
    all as Salesman A. Returns (feasibility, quotation, order) JSON."""
    a = api(world["a"])
    feasibility = _ok(
        a.post(
            "/api/feasibility",
            json={
                "customer_id": world["cust_a"].id,
                "required_by_date": (today_kuwait() + timedelta(days=45)).isoformat(),
                "lines": [{"product_id": product.id, "quantity": quantity}],
            },
        )
    )
    checked = _ok(a.post(f"/api/feasibility/{feasibility['id']}/run"))
    assert checked["status"] in ("feasible", "converted"), checked["status"]

    # The check auto-drafts the quotation (Settings default); take it from there.
    quotations = _ok(a.get("/api/quotations", params={"feasibility_id": feasibility["id"]}))["items"]
    assert len(quotations) == 1, "feasibility should have produced exactly one quotation"
    quotation = quotations[0]

    _ok(a.post(f"/api/quotations/{quotation['id']}/status", json={"status": "accepted"}))
    # The link to the external payment system is entered once accepted, and
    # is required before the quotation converts to an order.
    _ok(a.post(f"/api/quotations/{quotation['id']}/payment-link", json={"payment_link": "https://pay.example/acme"}))
    order = _ok(a.post(f"/api/orders/from-quotation/{quotation['id']}"))
    _ok(a.post(f"/api/orders/{order['id']}/status", json={"status": "confirmed"}))
    return checked, quotation, _ok(a.get(f"/api/orders/{order['id']}"))


def _line(api, user, order_id):
    return _ok(api(user).get(f"/api/orders/{order_id}/fulfillment"))[0]


def _produce_and_release(db, po, machine, quantity, start, lab_ref, *, release=True):
    """Production: one schedule -> one execution -> (QC accepts). Returns the
    execution; with release=False stops with the output sitting in QC."""
    schedule = production_order_schedule_service.create_schedule(
        db,
        po.id,
        {"machine_id": machine.id, "planned_quantity": quantity, "planned_start": start, "planned_end": start.replace(hour=20)},
    )
    execution = production_execution_service.start_execution(db, po.id, schedule.id, planned_quantity=quantity)
    execution = production_execution_service.complete_execution(db, execution.id, quantity)
    if release:
        agent = make_qc_agent(db)
        request = qc_service.create_request(
            db, {"production_order_id": po.id, "production_execution_id": execution.id, "qc_agent_id": agent.id}
        )
        qc_service.mark_sample_sent(db, request.id, None, None)
        qc_service.record_report(db, request.id, lab_ref, today_kuwait(), None, result="accepted")
    return execution


# ---------------------------------------------------------------------
# 1. Shortage: FG first, production only for the shortage, QC, partial delivery
# ---------------------------------------------------------------------


def test_full_chain_allocates_fg_first_produces_only_the_shortage_and_delivers_in_parts(db, api, world):
    # Production will be driven as Production orders through QC (spec:
    # Production -> QC -> Released FG), so the legacy auto-batch on confirm
    # is off for this run -- test 2 covers what that automation does.
    settings_service.update(db, {"auto_schedule_production_on_order_confirm": "false"})
    product, machine = _product(db, fg_on_hand=300)

    feasibility, quotation, order = _sales_chain_to_confirmed_order(api, world, product, quantity=1000)
    order_id = order["id"]
    assert order["status"] == "confirmed"
    assert order["quotation_number"] == quotation["quotation_number"]

    # -- Feasibility already knew: FG first, the rest is production demand.
    a = api(world["a"])
    line = _ok(a.get(f"/api/feasibility/{feasibility['id']}"))["lines"][0]
    assert line["quantity"] == 1000
    assert line["covered_by_stock"] == 300  # existing FG counted before any production need

    # -- Salesman B sees none of this chain.
    b = api(world["b"])
    for url in (f"/api/feasibility/{feasibility['id']}", f"/api/quotations/{quotation['id']}", f"/api/orders/{order_id}",
                f"/api/orders/{order_id}/fulfillment"):
        assert b.get(url).status_code == 404, url

    # -- Fulfilment view: 300 allocated from FG, 700 short, nothing produced yet.
    f = _line(api, world["a"], order_id)
    assert (f["ordered_quantity"], f["allocated_quantity"], f["produced_quantity"], f["delivered_quantity"], f["remaining_quantity"]) == (1000, 300, 0, 0, 1000)
    assert f["shortage"] == 700

    # -- Production is raised for the SHORTAGE only, against this order line.
    detail_id = f["order_detail_id"]
    po = production_order_service.create_production_order(
        db, {"order_detail_id": detail_id, "planned_quantity": f["shortage"], "due_date": DUE}
    )
    assert float(po.planned_quantity) == 700
    # Production's own prep: work out and allocate the materials for those 700.
    production_order_material_service.calculate(db, po.id)
    for requirement in production_order_material_service.get_requirements(db, po.id):
        production_order_material_service.allocate(db, po.id, requirement.id, float(requirement.required_quantity))

    # -- First run: 400 produced, sitting in QC -> visible to Sales as QC-pending, NOT yet allocatable.
    execution = _produce_and_release(db, po, machine, 400, _at(2), "LAB-1", release=False)
    f = _line(api, world["a"], order_id)
    assert (f["produced_quantity"], f["qc_pending_quantity"], f["released_quantity"], f["allocated_quantity"]) == (400, 400, 0, 300)

    # -- QC accepts: released into general FG -> allocation grows to 700.
    agent = make_qc_agent(db)
    request = qc_service.create_request(
        db, {"production_order_id": po.id, "production_execution_id": execution.id, "qc_agent_id": agent.id}
    )
    qc_service.mark_sample_sent(db, request.id, None, None)
    qc_service.record_report(db, request.id, "LAB-1", today_kuwait(), None, result="accepted")
    f = _line(api, world["a"], order_id)
    assert (f["produced_quantity"], f["qc_pending_quantity"], f["released_quantity"], f["allocated_quantity"]) == (400, 0, 400, 700)
    assert f["shortage"] == 300

    # -- Partial delivery #1. Going ready-to-ship drafts a delivery note for
    # exactly what released stock covers (700 of 1000) -- Sales just issues it.
    _ok(a.post(f"/api/orders/{order_id}/status", json={"status": "ready_to_ship"}))
    drafts = [n for n in _ok(a.get("/api/delivery-notes", params={"order_id": order_id}))["items"] if n["status"] == "draft"]
    assert len(drafts) == 1 and float(drafts[0]["lines"][0]["quantity_delivered"]) == 700
    note1 = drafts[0]
    _ok(a.post(f"/api/delivery-notes/{note1['id']}/status", json={"status": "issued"}))

    order_now = _ok(a.get(f"/api/orders/{order_id}"))
    assert order_now["status"] == "shipped"  # NOT delivered: 300 still owed
    f = _line(api, world["a"], order_id)
    assert (f["delivered_quantity"], f["remaining_quantity"]) == (700, 300)
    assert inventory_service.get_stock(db, "product", product.id)["quantity_on_hand"] == 0

    # -- Second run for the rest, QC accepts, delivery #2 completes the order.
    _produce_and_release(db, po, machine, 300, _at(3), "LAB-2")
    f = _line(api, world["a"], order_id)
    assert (f["produced_quantity"], f["released_quantity"], f["allocated_quantity"], f["shortage"]) == (700, 700, 300, 0)

    # Lines omitted: the note defaults to what is outstanding, capped at stock (300).
    note2 = _ok(a.post("/api/delivery-notes", json={"order_id": order_id, "delivery_date": today_kuwait().isoformat()}))
    assert float(note2["lines"][0]["quantity_delivered"]) == 300
    _ok(a.post(f"/api/delivery-notes/{note2['id']}/status", json={"status": "issued"}))

    assert _ok(a.get(f"/api/orders/{order_id}"))["status"] == "delivered"
    f = _line(api, world["a"], order_id)
    assert (f["delivered_quantity"], f["remaining_quantity"]) == (1000, 0)
    assert inventory_service.get_stock(db, "product", product.id)["quantity_on_hand"] == 0
    # Two delivery notes, 700 + 300 -- and only those.
    notes = _ok(a.get("/api/delivery-notes", params={"order_id": order_id}))["items"]
    assert sorted(float(n["lines"][0]["quantity_delivered"]) for n in notes if n["status"] == "issued") == [300, 700]

    # -- Every role's view of the finished order.
    assert api(world["manager"]).get(f"/api/orders/{order_id}").status_code == 200
    assert api(world["admin"]).get(f"/api/orders/{order_id}").status_code == 200
    assert api(world["b"]).get(f"/api/orders/{order_id}").status_code == 404


# ---------------------------------------------------------------------
# 2. Default automation: production is scheduled for the shortage only -- and never when FG covers the order
# ---------------------------------------------------------------------


def _scheduled_quantity(db, order_id):
    rows = db.query(ProductionSchedule).filter(ProductionSchedule.order_id == order_id, ProductionSchedule.deleted_at.is_(None)).all()
    return sum(float(r.planned_quantity) for r in rows)


def test_confirming_schedules_production_for_the_shortage_only(db, api, world):
    product, _ = _product(db, fg_on_hand=300)
    _, _, order = _sales_chain_to_confirmed_order(api, world, product, quantity=1000)

    assert _scheduled_quantity(db, order["id"]) == 700  # 1000 ordered - 300 already on the shelf


def test_an_order_fully_covered_by_fg_creates_no_production_and_ships_from_stock(db, api, world):
    product, _ = _product(db, fg_on_hand=5000)
    _, _, order = _sales_chain_to_confirmed_order(api, world, product, quantity=1000)
    order_id = order["id"]

    assert _scheduled_quantity(db, order_id) == 0  # an order existing is not a reason to produce
    a = api(world["a"])
    assert _ok(a.get(f"/api/orders/{order_id}"))["status"] == "ready_to_ship"  # straight to shipping

    f = _line(api, world["a"], order_id)
    assert (f["allocated_quantity"], f["shortage"], f["produced_quantity"]) == (1000, 0, 0)

    # The ready-to-ship delivery note was drafted for the whole order; issue it.
    notes = _ok(a.get("/api/delivery-notes", params={"order_id": order_id}))["items"]
    assert len(notes) == 1 and float(notes[0]["lines"][0]["quantity_delivered"]) == 1000
    _ok(a.post(f"/api/delivery-notes/{notes[0]['id']}/status", json={"status": "issued"}))

    assert _ok(a.get(f"/api/orders/{order_id}"))["status"] == "delivered"
    assert inventory_service.get_stock(db, "product", product.id)["quantity_on_hand"] == 4000
