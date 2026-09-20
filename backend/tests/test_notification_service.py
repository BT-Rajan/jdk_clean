"""notification_service.get_notifications -- covers the QC-overdue item
(qc_request_admin_review) added alongside the dashboard's new Needs
Attention section, since this file previously had no coverage at all.
Only exercises the new item type; the other eleven existing item types
already run against real data in production and aren't re-verified here.
"""

from datetime import date, datetime

from app.models.department import Department
from app.models.inventory import RawMaterialInventory
from app.models.production_execution import ProductionExecution
from app.models.qc_request import QcRequest
from app.services import notification_service

from .factories import (
    make_department,
    make_production_order,
    make_production_schedule,
    make_product,
    make_qc_agent,
    make_raw_material,
    make_user,
)


def _make_overdue_qc_request(db):
    product = make_product(db)
    po = make_production_order(
        db, order_id=None, order_detail_id=None, product_id=product.id, planned_quantity=100, due_date=date(2026, 1, 10)
    )
    schedule = make_production_schedule(
        db, product_id=product.id, planned_quantity=100, scheduled_start=date(2026, 1, 1), scheduled_end=date(2026, 1, 5)
    )
    execution = ProductionExecution(
        production_order_id=po.id,
        schedule_id=schedule.id,
        product_id=product.id,
        planned_quantity=100,
        started_at=datetime(2026, 1, 1, 8, 0),
    )
    db.add(execution)
    db.flush()
    agent = make_qc_agent(db)
    qc_request = QcRequest(
        qc_request_number="TESTQC-1",
        production_order_id=po.id,
        production_execution_id=execution.id,
        product_id=product.id,
        qc_agent_id=agent.id,
        sample_reference="TESTSAMPLE-1",
        quantity=50,
        request_date=date(2026, 1, 2),
        expected_report_date=date(2026, 1, 3),
        status="sample_sent",
        admin_review_required=True,
    )
    db.add(qc_request)
    db.flush()
    return po, qc_request


def test_admin_sees_overdue_qc_request_linked_to_its_production_order(db):
    po, qc_request = _make_overdue_qc_request(db)
    admin = make_user(db, role="admin", department_id=None)

    items = notification_service.get_notifications(db, admin)
    qc_items = [i for i in items if i["type"] == "qc_request_admin_review"]

    assert len(qc_items) == 1
    assert qc_items[0]["id"] == f"qc-request-review-{qc_request.id}"
    assert qc_items[0]["link"] == f"/production-orders/{po.id}"
    assert qc_request.qc_request_number in qc_items[0]["title"]


def test_non_admin_does_not_see_qc_admin_review_item(db):
    _make_overdue_qc_request(db)
    team_member = make_user(db, role="team_member", department_id=None)

    items = notification_service.get_notifications(db, team_member)

    assert not any(i["type"] == "qc_request_admin_review" for i in items)


def test_qc_request_not_flagged_for_review_is_not_surfaced(db):
    _, qc_request = _make_overdue_qc_request(db)
    qc_request.admin_review_required = False
    db.flush()
    admin = make_user(db, role="admin", department_id=None)

    items = notification_service.get_notifications(db, admin)

    assert not any(i["type"] == "qc_request_admin_review" for i in items)


# --- low-stock notifications reach Procurement ---------------------------------


def _procurement_department(db):
    """schema.sql seeds a 'procurement' department (code is UNIQUE), so reuse
    it and only create one if the test database was built without it."""
    return db.query(Department).filter(Department.code == "procurement").first() or make_department(
        db, code="procurement"
    )


def test_procurement_user_sees_low_stock_material_with_stock_on_hand(db):
    user = make_user(db, role="team_member", department_id=_procurement_department(db).id)
    material = make_raw_material(db, reorder_point=50)
    db.add(RawMaterialInventory(raw_material_id=material.id, quantity_on_hand=10))
    db.flush()

    items = notification_service.get_notifications(db, user)

    assert any(i["id"] == f"low-stock-{material.id}" for i in items)


def test_procurement_user_sees_never_stocked_material_as_low(db):
    """No inventory row yet means 0 on hand, which is at/below any reorder
    point -- it used to be skipped by an inner join."""
    user = make_user(db, role="department_head", department_id=_procurement_department(db).id)
    material = make_raw_material(db, reorder_point=5)

    items = notification_service.get_notifications(db, user)

    assert any(i["id"] == f"low-stock-{material.id}" for i in items)


def test_material_above_reorder_point_is_not_low_stock(db):
    user = make_user(db, role="team_member", department_id=_procurement_department(db).id)
    material = make_raw_material(db, reorder_point=5)
    db.add(RawMaterialInventory(raw_material_id=material.id, quantity_on_hand=100))
    db.flush()

    items = notification_service.get_notifications(db, user)

    assert not any(i["id"] == f"low-stock-{material.id}" for i in items)
