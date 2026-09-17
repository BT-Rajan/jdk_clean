"""P7: tracks the external QC workflow -- JDK never performs the actual
testing itself, only the request/dispatch/report/decision around it, and
gates when a Production Execution's produced quantity becomes real,
releasable FinishedGoodsInventory stock. See
app/models/qc_request.py and docs/production-lifecycle.md.

Release reuses the existing inventory transaction architecture exactly
like P6's material consumption did -- inventory_service.adjust_stock,
never a second stock ledger or a parallel "QC-hold" quantity on
FinishedGoodsInventory. Produced-but-unreleased stock simply isn't in
FinishedGoodsInventory yet (see ProductionExecution.released_quantity's
own docstring) -- there's nothing else to build.

All business dates here (request_date, dispatch_date, received_date,
decided_date) come from core.timezone.today_kuwait(), never a client-
supplied value, per the P7 spec's global Kuwait-time rule.
"""

from datetime import date

from sqlalchemy.orm import Session, joinedload

from app.core.exceptions import ConflictError, NotFoundError, ValidationAppError
from app.core.timezone import now_kuwait_naive, today_kuwait
from app.core.workflow import assert_transition_allowed
from app.core.pagination import sort_and_paginate
from app.models.production_execution import ProductionExecution
from app.models.qc_agent import QcAgent
from app.models.qc_request import ALLOWED_TRANSITIONS, QcRequest
from app.services import audit_service, inventory_service, number_series_service

TABLE_NAME = "qc_requests"
EXECUTION_TABLE_NAME = "production_executions"


def _base_query(db: Session):
    return db.query(QcRequest).options(
        joinedload(QcRequest.production_order),
        joinedload(QcRequest.product),
        joinedload(QcRequest.qc_agent),
    )


def get_request(db: Session, request_id: int) -> QcRequest:
    obj = _base_query(db).filter(QcRequest.id == request_id).first()
    if obj is None:
        raise NotFoundError("QC request")
    return obj


_SORTABLE_FIELDS = {
    "qc_request_number": QcRequest.qc_request_number,
    "request_date": QcRequest.request_date,
    "status": QcRequest.status,
    "created_at": QcRequest.created_at,
}


def list_requests(
    db: Session,
    page: int = 1,
    page_size: int = 25,
    production_order_id: int | None = None,
    production_execution_id: int | None = None,
    qc_agent_id: int | None = None,
    status: str | None = None,
    sort: str | None = None,
) -> dict:
    query = _base_query(db)
    if production_order_id:
        query = query.filter(QcRequest.production_order_id == production_order_id)
    if production_execution_id:
        query = query.filter(QcRequest.production_execution_id == production_execution_id)
    if qc_agent_id:
        query = query.filter(QcRequest.qc_agent_id == qc_agent_id)
    if status:
        query = query.filter(QcRequest.status == status)
    return sort_and_paginate(query, QcRequest, _SORTABLE_FIELDS, sort, page, page_size, default_field="request_date")


def _lock_request_row(db: Session, request_id: int):
    """Column-only locking read -- QcRequest's own relationships are all
    lazy="joined" at the model level, same outer-join-under-FOR-UPDATE
    reasoning as every other locked row in this app (see
    production_order_material_service.calculate's own comment)."""
    row = (
        db.query(
            QcRequest.id,
            QcRequest.status,
            QcRequest.production_order_id,
            QcRequest.production_execution_id,
        )
        .filter(QcRequest.id == request_id)
        .with_for_update()
        .first()
    )
    if row is None:
        raise NotFoundError("QC request")
    return row


def _lock_execution_row(db: Session, execution_id: int):
    row = (
        db.query(
            ProductionExecution.id,
            ProductionExecution.status,
            ProductionExecution.product_id,
            ProductionExecution.produced_quantity,
            ProductionExecution.released_quantity,
        )
        .filter(ProductionExecution.id == execution_id)
        .with_for_update()
        .first()
    )
    if row is None:
        raise NotFoundError("Production execution")
    return row


def create_request(db: Session, data: dict, user_id: int | None = None) -> QcRequest:
    """Creates a QC request against a specific, already-completed
    Production Execution -- QC is always execution-scoped (spec section
    11's "partial/batch-based QC"), never a whole Production Order,
    since two runs under one order can be at entirely different QC
    stages.
    """
    execution = (
        db.query(ProductionExecution).filter(ProductionExecution.id == data["production_execution_id"]).first()
    )
    if execution is None:
        raise NotFoundError("Production execution")
    if execution.production_order_id != data["production_order_id"]:
        raise ValidationAppError("This execution does not belong to the given production order.")
    if execution.status != "completed":
        raise ConflictError(
            f"Cannot request QC for an execution in '{execution.status}' status; it must be completed."
        )

    agent = db.query(QcAgent).filter(QcAgent.id == data["qc_agent_id"], QcAgent.deleted_at.is_(None)).first()
    if agent is None:
        raise ValidationAppError("This QC agent no longer exists.")
    if agent.status != "active":
        raise ValidationAppError(f"{agent.name} is inactive and cannot receive new QC requests.")

    qc_request_number = number_series_service.next_number(db, "QC_REQUEST")
    sample_reference = number_series_service.next_number(db, "QC_SAMPLE")

    request = QcRequest(
        qc_request_number=qc_request_number,
        production_order_id=data["production_order_id"],
        production_execution_id=execution.id,
        product_id=execution.product_id,
        qc_agent_id=agent.id,
        sample_reference=sample_reference,
        sample_quantity=data.get("sample_quantity"),
        request_date=today_kuwait(),
        expected_report_date=data.get("expected_report_date"),
        notes=data.get("notes"),
        created_by=user_id,
    )
    db.add(request)
    db.flush()
    audit_service.log_create(db, TABLE_NAME, request.id, user_id)
    db.commit()
    return get_request(db, request.id)


def mark_sample_sent(
    db: Session,
    request_id: int,
    dispatch_method: str | None,
    external_reference: str | None,
    user_id: int | None = None,
) -> QcRequest:
    row = _lock_request_row(db, request_id)
    assert_transition_allowed(ALLOWED_TRANSITIONS, row.status, "sample_sent", "QC request")

    db.query(QcRequest).filter(QcRequest.id == row.id).update(
        {
            "status": "sample_sent",
            "dispatch_date": today_kuwait(),
            "dispatch_method": dispatch_method,
            "external_reference": external_reference,
            "dispatched_by": user_id,
            "updated_by": user_id,
        }
    )
    audit_service.log_update(db, TABLE_NAME, row.id, {"status": (row.status, "sample_sent")}, user_id)
    db.commit()
    return get_request(db, row.id)


def record_report(
    db: Session,
    request_id: int,
    report_number: str,
    report_date: date,
    remarks: str | None,
    result: str | None = None,
    user_id: int | None = None,
) -> QcRequest:
    """Records the external report -- only reachable once (status must
    be 'sample_sent'), so report_number/report_date are effectively
    write-once (spec section 15's immutability rule; a second call finds
    the status already past 'sample_sent' and is rejected by
    assert_transition_allowed, satisfying spec Test 7's duplicate-
    submission guard together with the row lock below).

    `result`, when given, decides the request in this same call --
    common case, a report that already states its conclusion. Left
    unset, the request stops at 'report_received' with no result yet
    (spec section 4/6), and a later record_result call finishes it.
    """
    row = _lock_request_row(db, request_id)
    new_status = result if result else "report_received"
    assert_transition_allowed(ALLOWED_TRANSITIONS, row.status, new_status, "QC request")

    values = {
        "report_number": report_number,
        "report_date": report_date,
        "received_date": today_kuwait(),
        "status": new_status,
        "updated_by": user_id,
    }
    if remarks is not None:
        values["notes"] = remarks
    if result:
        values["decided_date"] = today_kuwait()
        values["decided_by"] = user_id

    db.query(QcRequest).filter(QcRequest.id == row.id).update(values)

    if result == "accepted":
        _release_execution_fg(db, row.production_execution_id, row.id, user_id)

    audit_service.log_update(db, TABLE_NAME, row.id, {"status": (row.status, new_status)}, user_id)
    db.commit()
    return get_request(db, row.id)


def record_result(db: Session, request_id: int, result: str, user_id: int | None = None) -> QcRequest:
    """Finishes a request that was left at 'report_received' with no
    conclusion yet -- the follow-up half of record_report's own
    docstring. Only reachable from 'report_received', so this too is a
    one-time, immutable decision (accepted/rejected are terminal)."""
    row = _lock_request_row(db, request_id)
    assert_transition_allowed(ALLOWED_TRANSITIONS, row.status, result, "QC request")

    db.query(QcRequest).filter(QcRequest.id == row.id).update(
        {
            "status": result,
            "decided_date": today_kuwait(),
            "decided_by": user_id,
            "updated_by": user_id,
        }
    )

    if result == "accepted":
        _release_execution_fg(db, row.production_execution_id, row.id, user_id)

    audit_service.log_update(db, TABLE_NAME, row.id, {"status": (row.status, result)}, user_id)
    db.commit()
    return get_request(db, row.id)


def _release_execution_fg(db: Session, execution_id: int, qc_request_id: int, user_id: int | None) -> None:
    """Converts whatever's left of an execution's produced_quantity into
    real, releasable FinishedGoodsInventory stock (spec section 10) --
    the exact same adjust_stock primitive P6's material consumption and
    every other physical stock movement in this app already uses, never
    a second inventory system. Only the *remaining unreleased* amount
    moves, so a second acceptance for the same execution (a resubmitted
    request after an earlier one was somehow still open, or any other
    path that reaches this twice) is a safe no-op rather than a double
    release -- see spec Test 7.

    commit=False -- the caller (record_report/record_result) holds a
    lock on the QC request row for the whole call and needs the stock
    movement, the execution's own update, and the request's own status
    change folded into one commit.
    """
    row = _lock_execution_row(db, execution_id)
    to_release = round(float(row.produced_quantity) - float(row.released_quantity), 4)
    if to_release <= 0:
        return

    inventory_service.adjust_stock(
        db,
        item_type="product",
        item_id=row.product_id,
        quantity=to_release,
        movement_type="receipt",
        reference_type="qc_request",
        reference_id=qc_request_id,
        notes=f"Released by QC request #{qc_request_id}",
        user_id=user_id,
        commit=False,
    )

    new_released = round(float(row.released_quantity) + to_release, 4)
    db.query(ProductionExecution).filter(ProductionExecution.id == row.id).update(
        {"released_quantity": new_released, "updated_by": user_id}
    )
    audit_service.log_update(
        db, EXECUTION_TABLE_NAME, row.id, {"released_quantity": (float(row.released_quantity), new_released)}, user_id
    )


def get_fg_release_statuses(db: Session, production_order_id: int) -> dict[int, str]:
    """One rollup per execution under this Production Order --
    'not_applicable' (not completed yet), 'not_requested', 'pending',
    'released', or 'rejected'. Never stored -- always derived fresh from
    this table plus the execution's own released_quantity, the same
    "compute, don't duplicate" stance every other status rollup in this
    app already takes (P3's overall_status, P4's allocation_status,
    P5's schedule_status, P6's execution_status)."""
    executions = (
        db.query(
            ProductionExecution.id,
            ProductionExecution.status,
            ProductionExecution.produced_quantity,
            ProductionExecution.released_quantity,
        )
        .filter(ProductionExecution.production_order_id == production_order_id)
        .all()
    )
    requests = (
        db.query(QcRequest.production_execution_id, QcRequest.status)
        .filter(QcRequest.production_order_id == production_order_id)
        .all()
    )
    statuses_by_execution: dict[int, list[str]] = {}
    for execution_id, status in requests:
        statuses_by_execution.setdefault(execution_id, []).append(status)

    result: dict[int, str] = {}
    for execution_id, exec_status, produced, released in executions:
        if exec_status != "completed":
            result[execution_id] = "not_applicable"
            continue
        produced = float(produced)
        released = float(released)
        statuses = statuses_by_execution.get(execution_id, [])
        if produced > 0 and released >= produced:
            result[execution_id] = "released"
        elif "rejected" in statuses and "accepted" not in statuses:
            result[execution_id] = "rejected"
        elif statuses:
            result[execution_id] = "pending"
        else:
            result[execution_id] = "not_requested"
    return result


def admin_review(db: Session, request_id: int, notes: str, user_id: int | None = None) -> QcRequest:
    """Admin clears an overdue-report escalation, recording their
    decision -- same pattern as production_service.admin_review."""
    request = get_request(db, request_id)
    if not request.admin_review_required:
        raise ConflictError("This QC request has no pending admin review.")

    request.admin_review_required = False
    request.admin_reviewed_at = now_kuwait_naive()
    request.admin_reviewed_by = user_id
    request.admin_review_notes = notes
    request.updated_by = user_id
    audit_service.log_update(db, TABLE_NAME, request_id, {"admin_review_required": (True, False)}, user_id)
    db.commit()
    return get_request(db, request_id)


def escalate_overdue_qc_requests(db: Session, as_of: date | None = None) -> list[QcRequest]:
    """Flags every request whose expected_report_date has passed and
    isn't yet resolved -- the QC-side mirror of
    production_service.escalate_overdue_batches. Meant to be run
    periodically (see core/scheduler.py); idempotent -- re-running only
    (re)flags requests that still qualify, it never clears
    admin_review_required itself (only admin_review does that)."""
    today = as_of or today_kuwait()

    candidates = (
        db.query(QcRequest)
        .filter(
            QcRequest.status.notin_(("accepted", "rejected")),
            QcRequest.expected_report_date.isnot(None),
            QcRequest.admin_review_required.is_(False),
        )
        .all()
    )

    flagged: list[QcRequest] = []
    for request in candidates:
        if request.expected_report_date < today:
            request.admin_review_required = True
            audit_service.log_update(db, TABLE_NAME, request.id, {"admin_review_required": (False, True)}, None)
            flagged.append(request)

    if flagged:
        db.commit()
    return flagged
