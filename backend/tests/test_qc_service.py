"""Regression tests for qc_service's P7 external QC workflow -- the UAT
scenarios from the P7 spec: request creation, sample dispatch, report-
pending visibility, accepted release, rejected block, independent
multi-execution QC, duplicate report submission, and Kuwait timestamps.
"""

from datetime import date, datetime, timedelta

import pytest

from app.core.exceptions import ConflictError, NotFoundError, ValidationAppError
from app.core.timezone import today_kuwait
from app.services import (
    inventory_service,
    production_execution_service,
    production_order_schedule_service,
    qc_service,
)

from .factories import (
    make_customer,
    make_machine,
    make_order,
    make_production_order,
    make_product,
    make_qc_agent,
)

DUE = date(2026, 12, 1)


def _completed_execution(db, quantity: float = 500):
    """A completed Production Execution ready for QC -- no BOM/material
    involved, since QC only gates finished-goods release, not raw
    material (that's P6's own concern)."""
    customer = make_customer(db)
    machine = make_machine(db)
    product = make_product(db, machine_id=machine.id, production_hours_per_unit=0.001)
    order = make_order(
        db, customer.id, lines=[{"product_id": product.id, "quantity": quantity, "unit_price": 10}], status="confirmed"
    )
    po = make_production_order(db, order.id, order.lines[0].id, product.id, quantity, DUE)
    schedule = production_order_schedule_service.create_schedule(
        db,
        po.id,
        {"machine_id": machine.id, "planned_start": datetime(2026, 9, 25, 8, 0), "planned_end": datetime(2026, 9, 25, 20, 0)},
    )
    execution = production_execution_service.start_execution(db, po.id, schedule.id, planned_quantity=quantity)
    execution = production_execution_service.complete_execution(db, execution.id, quantity)
    return po, execution, product


def _create_request(db, po, execution, agent=None, **overrides):
    agent = agent or make_qc_agent(db)
    data = {
        "production_order_id": po.id,
        "production_execution_id": execution.id,
        "qc_agent_id": agent.id,
        "sample_quantity": overrides.pop("sample_quantity", 5),
        "expected_report_date": overrides.pop("expected_report_date", None),
        "notes": overrides.pop("notes", None),
    }
    return qc_service.create_request(db, data), agent


def test_create_qc_request(db):
    po, execution, product = _completed_execution(db, quantity=500)
    agent = make_qc_agent(db)

    request, _ = _create_request(db, po, execution, agent=agent, sample_quantity=5)

    assert request.production_order_id == po.id
    assert request.production_execution_id == execution.id
    assert request.product_id == product.id
    assert request.qc_agent_id == agent.id
    assert request.sample_quantity == 5
    assert request.sample_reference
    assert request.request_date == today_kuwait()
    assert request.status == "requested"


def test_create_request_rejected_for_incomplete_execution(db):
    customer = make_customer(db)
    machine = make_machine(db)
    product = make_product(db, machine_id=machine.id, production_hours_per_unit=0.001)
    order = make_order(db, customer.id, lines=[{"product_id": product.id, "quantity": 100, "unit_price": 10}], status="confirmed")
    po = make_production_order(db, order.id, order.lines[0].id, product.id, 100, DUE)
    schedule = production_order_schedule_service.create_schedule(
        db, po.id, {"machine_id": machine.id, "planned_start": datetime(2026, 9, 25, 8, 0), "planned_end": datetime(2026, 9, 25, 20, 0)}
    )
    execution = production_execution_service.start_execution(db, po.id, schedule.id, planned_quantity=100)
    agent = make_qc_agent(db)

    with pytest.raises(ConflictError):
        _create_request(db, po, execution, agent=agent)


def test_create_request_rejected_for_inactive_agent(db):
    po, execution, _ = _completed_execution(db)
    agent = make_qc_agent(db, status="inactive")

    with pytest.raises(ValidationAppError):
        _create_request(db, po, execution, agent=agent)


def test_mark_sample_sent(db):
    po, execution, _ = _completed_execution(db)
    request, _ = _create_request(db, po, execution)

    updated = qc_service.mark_sample_sent(db, request.id, "Courier - Aramex", "TRK123")

    assert updated.status == "sample_sent"
    assert updated.dispatch_date == today_kuwait()
    assert updated.dispatch_method == "Courier - Aramex"
    assert updated.external_reference == "TRK123"
    assert updated.dispatched_by is None  # no user_id passed in this test


def test_report_pending_before_report_and_fg_not_released(db):
    po, execution, product = _completed_execution(db, quantity=500)
    stock_before = inventory_service.get_stock(db, "product", product.id)
    request, _ = _create_request(db, po, execution)
    qc_service.mark_sample_sent(db, request.id, None, None)

    statuses = qc_service.get_fg_release_statuses(db, po.id)
    assert statuses[execution.id] == "pending"
    stock_after = inventory_service.get_stock(db, "product", product.id)
    assert stock_after == stock_before


def test_report_accepted_releases_finished_goods(db):
    po, execution, product = _completed_execution(db, quantity=500)
    stock_before = inventory_service.get_stock(db, "product", product.id)
    request, _ = _create_request(db, po, execution)
    qc_service.mark_sample_sent(db, request.id, None, None)

    updated = qc_service.record_report(
        db, request.id, "LAB-REPORT-1", date(2026, 9, 26), "Meets spec.", result="accepted"
    )

    assert updated.status == "accepted"
    assert updated.report_number == "LAB-REPORT-1"
    assert updated.decided_date == today_kuwait()
    stock_after = inventory_service.get_stock(db, "product", product.id)
    assert stock_after["quantity_on_hand"] == stock_before["quantity_on_hand"] + 500

    statuses = qc_service.get_fg_release_statuses(db, po.id)
    assert statuses[execution.id] == "released"

    movements = inventory_service.get_movement_history(
        db, item_type="product", item_id=product.id, reference_type="qc_request", reference_id=request.id
    )
    assert movements["total"] == 1
    assert movements["items"][0]["quantity"] == 500


def test_report_rejected_blocks_finished_goods(db):
    po, execution, product = _completed_execution(db, quantity=500)
    stock_before = inventory_service.get_stock(db, "product", product.id)
    request, _ = _create_request(db, po, execution)
    qc_service.mark_sample_sent(db, request.id, None, None)

    updated = qc_service.record_report(
        db, request.id, "LAB-REPORT-2", date(2026, 9, 26), "Fails spec.", result="rejected"
    )

    assert updated.status == "rejected"
    stock_after = inventory_service.get_stock(db, "product", product.id)
    assert stock_after == stock_before  # no release, and nothing scrapped/reworked either
    statuses = qc_service.get_fg_release_statuses(db, po.id)
    assert statuses[execution.id] == "rejected"


def test_report_received_without_result_then_decided_later(db):
    """Spec section 4/6: a report can sit at REPORT_RECEIVED with no
    conclusion yet, without JDK inventing one."""
    po, execution, product = _completed_execution(db)
    request, _ = _create_request(db, po, execution)
    qc_service.mark_sample_sent(db, request.id, None, None)

    received = qc_service.record_report(db, request.id, "LAB-REPORT-3", date(2026, 9, 26), None, result=None)
    assert received.status == "report_received"
    assert received.decided_date is None

    decided = qc_service.record_result(db, request.id, "accepted")
    assert decided.status == "accepted"
    assert decided.decided_date == today_kuwait()


def test_multiple_executions_have_independent_qc_status(db):
    """Spec section 11/Test 6: one accepted execution must not make a
    sibling execution under the same production order look released."""
    customer = make_customer(db)
    machine = make_machine(db)
    product = make_product(db, machine_id=machine.id, production_hours_per_unit=0.001)
    order = make_order(db, customer.id, lines=[{"product_id": product.id, "quantity": 1000, "unit_price": 10}], status="confirmed")
    po = make_production_order(db, order.id, order.lines[0].id, product.id, 1000, DUE)
    schedule = production_order_schedule_service.create_schedule(
        db, po.id, {"machine_id": machine.id, "planned_quantity": 500, "planned_start": datetime(2026, 9, 25, 8, 0), "planned_end": datetime(2026, 9, 25, 20, 0)}
    )
    schedule2 = production_order_schedule_service.create_schedule(
        db, po.id, {"machine_id": machine.id, "planned_quantity": 500, "planned_start": datetime(2026, 9, 26, 8, 0), "planned_end": datetime(2026, 9, 26, 20, 0)}
    )
    execution1 = production_execution_service.start_execution(db, po.id, schedule.id, planned_quantity=500)
    execution1 = production_execution_service.complete_execution(db, execution1.id, 500)
    execution2 = production_execution_service.start_execution(db, po.id, schedule2.id, planned_quantity=500)
    execution2 = production_execution_service.complete_execution(db, execution2.id, 500)

    request1, _ = _create_request(db, po, execution1)
    qc_service.mark_sample_sent(db, request1.id, None, None)
    qc_service.record_report(db, request1.id, "LAB-1", date(2026, 9, 27), None, result="accepted")

    statuses = qc_service.get_fg_release_statuses(db, po.id)
    assert statuses[execution1.id] == "released"
    assert statuses[execution2.id] == "not_requested"

    stock = inventory_service.get_stock(db, "product", product.id)
    assert stock["quantity_on_hand"] == 500  # only execution1's output released


def test_duplicate_report_submission_does_not_double_release(db):
    po, execution, product = _completed_execution(db, quantity=500)
    request, _ = _create_request(db, po, execution)
    qc_service.mark_sample_sent(db, request.id, None, None)
    qc_service.record_report(db, request.id, "LAB-REPORT-4", date(2026, 9, 26), None, result="accepted")

    with pytest.raises(ConflictError):
        qc_service.record_report(db, request.id, "LAB-REPORT-4-DUPLICATE", date(2026, 9, 26), None, result="accepted")

    stock = inventory_service.get_stock(db, "product", product.id)
    assert stock["quantity_on_hand"] == 500  # not 1000 -- no double release

    with pytest.raises(ConflictError):
        qc_service.record_result(db, request.id, "rejected")


def test_qc_timestamps_are_kuwait_calendar_dates(db):
    po, execution, _ = _completed_execution(db)
    request, _ = _create_request(db, po, execution)
    assert request.request_date == today_kuwait()

    sent = qc_service.mark_sample_sent(db, request.id, None, None)
    assert sent.dispatch_date == today_kuwait()

    received = qc_service.record_report(db, request.id, "LAB-REPORT-5", date(2026, 9, 26), None, result=None)
    assert received.received_date == today_kuwait()

    decided = qc_service.record_result(db, request.id, "accepted")
    assert decided.decided_date == today_kuwait()


def test_admin_review_clears_overdue_escalation(db):
    po, execution, _ = _completed_execution(db)
    request, _ = _create_request(
        db, po, execution, expected_report_date=today_kuwait() - timedelta(days=5)
    )

    flagged = qc_service.escalate_overdue_qc_requests(db, as_of=today_kuwait())
    assert request.id in [r.id for r in flagged]
    assert qc_service.get_request(db, request.id).admin_review_required is True

    reviewed = qc_service.admin_review(db, request.id, "Followed up with the lab by phone.")
    assert reviewed.admin_review_required is False
    assert reviewed.admin_review_notes == "Followed up with the lab by phone."

    with pytest.raises(ConflictError):
        qc_service.admin_review(db, request.id, "again")


def test_escalate_does_not_flag_requests_without_an_expected_date(db):
    po, execution, _ = _completed_execution(db)
    request, _ = _create_request(db, po, execution)  # no expected_report_date

    flagged = qc_service.escalate_overdue_qc_requests(db, as_of=today_kuwait() + timedelta(days=100))
    assert request.id not in [r.id for r in flagged]


def test_sample_sent_rejected_from_wrong_status(db):
    po, execution, _ = _completed_execution(db)
    request, _ = _create_request(db, po, execution)
    qc_service.mark_sample_sent(db, request.id, None, None)

    with pytest.raises(ConflictError):
        qc_service.mark_sample_sent(db, request.id, None, None)


def test_record_result_rejected_before_report_received(db):
    po, execution, _ = _completed_execution(db)
    request, _ = _create_request(db, po, execution)

    with pytest.raises(ConflictError):
        qc_service.record_result(db, request.id, "accepted")
