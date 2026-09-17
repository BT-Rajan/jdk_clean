from fastapi import APIRouter, Depends, File, Query, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.common import PagedResponse
from app.api.deps import require_role
from app.core.database import get_db
from app.core.exceptions import ConflictError, NotFoundError
from app.core.permissions import require_page_access
from app.models.user import User
from app.schemas.qc_request import (
    QcAdminReview,
    QcReportRecord,
    QcRequestCreate,
    QcRequestOut,
    QcResultRecord,
    QcSampleSentUpdate,
)
from app.services import audit_service, id_document_service, qc_service

router = APIRouter(prefix="/api/qc-requests", tags=["production"])
# Reuses the same "production" page key every other Production Order
# endpoint (P2-P6) is already gated by -- QC requests are one more layer
# of the same feature, not a separate module with its own access rules.
read_guard = require_page_access("production", "read")
write_guard = require_page_access("production", "write")
admin_guard = require_role("admin")

REPORT_DOCUMENT_SUBDIR = "qc_reports"
TABLE_NAME = "qc_requests"


@router.get("", response_model=PagedResponse)
def list_qc_requests(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=200),
    production_order_id: int | None = Query(None),
    production_execution_id: int | None = Query(None),
    qc_agent_id: int | None = Query(None),
    status: str | None = Query(None),
    sort: str | None = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(read_guard),
):
    result = qc_service.list_requests(
        db,
        page=page,
        page_size=page_size,
        production_order_id=production_order_id,
        production_execution_id=production_execution_id,
        qc_agent_id=qc_agent_id,
        status=status,
        sort=sort,
    )
    result["items"] = [QcRequestOut.from_model(r) for r in result["items"]]
    return result


@router.get("/{qc_request_id}", response_model=QcRequestOut)
def get_qc_request(
    qc_request_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(read_guard),
):
    return QcRequestOut.from_model(qc_service.get_request(db, qc_request_id))


@router.get("/{qc_request_id}/history")
def get_qc_request_history(
    qc_request_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(read_guard),
):
    qc_service.get_request(db, qc_request_id)  # 404s if missing
    return audit_service.get_history(db, TABLE_NAME, qc_request_id)


@router.post("", response_model=QcRequestOut, status_code=201)
def create_qc_request(
    payload: QcRequestCreate,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    request = qc_service.create_request(db, payload.model_dump(), user_id=user.id)
    return QcRequestOut.from_model(request)


@router.post("/{qc_request_id}/sample-sent", response_model=QcRequestOut)
def mark_sample_sent(
    qc_request_id: int,
    payload: QcSampleSentUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    request = qc_service.mark_sample_sent(
        db, qc_request_id, payload.dispatch_method, payload.external_reference, user_id=user.id
    )
    return QcRequestOut.from_model(request)


@router.post("/{qc_request_id}/report", response_model=QcRequestOut)
def record_report(
    qc_request_id: int,
    payload: QcReportRecord,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    request = qc_service.record_report(
        db,
        qc_request_id,
        payload.report_number,
        payload.report_date,
        payload.remarks,
        result=payload.result,
        user_id=user.id,
    )
    return QcRequestOut.from_model(request)


@router.post("/{qc_request_id}/result", response_model=QcRequestOut)
def record_result(
    qc_request_id: int,
    payload: QcResultRecord,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    request = qc_service.record_result(db, qc_request_id, payload.result, user_id=user.id)
    return QcRequestOut.from_model(request)


@router.post("/{qc_request_id}/report-document", response_model=QcRequestOut)
async def upload_report_document(
    qc_request_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    """Attaches the external report file -- reuses the existing generic
    document-attachment mechanism unchanged (id_document_service,
    already shared by customers/suppliers). Allowed only once per
    request: spec section 15 says a recorded report must never be
    silently replaced, so a second upload attempt is rejected outright
    rather than overwriting the first (id_document_service.save_document
    itself would happily replace it, since that's the right behavior for
    a KYC document a person can legitimately re-upload -- a QC report
    is not that, so the guard belongs here, not in the shared service).
    """
    request = qc_service.get_request(db, qc_request_id)
    if request.id_document_filename:
        raise ConflictError("This QC request already has a report document attached.")
    raw_bytes = await file.read()
    id_document_service.save_document(
        db, request, raw_bytes, subdir=REPORT_DOCUMENT_SUBDIR, table_name=TABLE_NAME, user_id=user.id
    )
    return QcRequestOut.from_model(qc_service.get_request(db, qc_request_id))


@router.get("/{qc_request_id}/report-document")
def get_report_document(
    qc_request_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(read_guard),
):
    request = qc_service.get_request(db, qc_request_id)
    found = id_document_service.get_document_file(request, subdir=REPORT_DOCUMENT_SUBDIR)
    if found is None:
        raise NotFoundError("Report document")
    path, media_type = found
    return FileResponse(path, media_type=media_type)


@router.post("/{qc_request_id}/admin-review", response_model=QcRequestOut)
def admin_review(
    qc_request_id: int,
    payload: QcAdminReview,
    db: Session = Depends(get_db),
    user: User = Depends(admin_guard),
):
    request = qc_service.admin_review(db, qc_request_id, payload.notes, user_id=user.id)
    return QcRequestOut.from_model(request)


@router.post("/scan-overdue")
def scan_overdue_qc_requests(
    db: Session = Depends(get_db),
    user: User = Depends(admin_guard),
):
    """Flags QC requests whose expected report date has passed and
    aren't yet resolved -- see qc_service.escalate_overdue_qc_requests.
    Also runs automatically every 6 hours (see core/scheduler.py)."""
    flagged = qc_service.escalate_overdue_qc_requests(db)
    return {"flagged_count": len(flagged), "qc_request_ids": [r.id for r in flagged]}
