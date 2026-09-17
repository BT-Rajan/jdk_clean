from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.common import PagedResponse
from app.core.database import get_db
from app.core.permissions import require_page_access
from app.models.user import User
from app.schemas.production_order import ProductionOrderCreate, ProductionOrderOut, ProductionOrderStatusUpdate
from app.schemas.production_order_material import MaterialAllocationRequest, MaterialRequirementSummaryOut
from app.schemas.production_order_schedule import (
    ProductionOrderScheduleCancel,
    ProductionOrderScheduleCreate,
    ProductionOrderScheduleItemOut,
    ProductionOrderScheduleSummaryOut,
    ProductionOrderScheduleUpdate,
)
from app.schemas.production_execution import (
    ProductionExecutionCancel,
    ProductionExecutionComplete,
    ProductionExecutionOut,
    ProductionExecutionStart,
    ProductionExecutionSummaryOut,
)
from app.services import (
    audit_service,
    production_execution_service,
    production_order_material_service,
    production_order_schedule_service,
    production_order_service,
    qc_service,
)

router = APIRouter(prefix="/api/production-orders", tags=["production"])
# Reuses the existing "production" page key rather than introducing a
# new one -- Production Orders are part of the same Production section
# the department_permissions matrix already governs for production
# schedules; a separate key would just be a second knob for the exact
# same audience to configure identically.
read_guard = require_page_access("production", "read")
write_guard = require_page_access("production", "write")


def _with_remaining(db: Session, po, out: ProductionOrderOut) -> ProductionOrderOut:
    if po.order_detail_id is not None:
        out.remaining_order_quantity = production_order_service.get_remaining_quantity(db, po.order_detail_id)
    return out


@router.get("", response_model=PagedResponse)
def list_production_orders(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=200),
    search: str | None = Query(None),
    status: str | None = Query(None),
    order_id: int | None = Query(None),
    order_detail_id: int | None = Query(None),
    product_id: int | None = Query(None),
    sort: str | None = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(read_guard),
):
    result = production_order_service.list_production_orders(
        db,
        page=page,
        page_size=page_size,
        search=search,
        status=status,
        order_id=order_id,
        order_detail_id=order_detail_id,
        product_id=product_id,
        sort=sort,
    )
    result["items"] = [_with_remaining(db, po, ProductionOrderOut.from_model(po)) for po in result["items"]]
    return result


@router.get("/{production_order_id}", response_model=ProductionOrderOut)
def get_production_order(
    production_order_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(read_guard),
):
    po = production_order_service.get_production_order(db, production_order_id)
    return _with_remaining(db, po, ProductionOrderOut.from_model(po))


@router.get("/{production_order_id}/history")
def get_production_order_history(
    production_order_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(read_guard),
):
    production_order_service.get_production_order(db, production_order_id)  # 404s if missing
    return audit_service.get_history(db, "production_orders", production_order_id)


@router.post("", response_model=ProductionOrderOut, status_code=201)
def create_production_order(
    payload: ProductionOrderCreate,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    po = production_order_service.create_production_order(db, payload.model_dump(), user_id=user.id)
    return _with_remaining(db, po, ProductionOrderOut.from_model(po))


@router.get("/{production_order_id}/material-requirements", response_model=MaterialRequirementSummaryOut)
def get_material_requirements(
    production_order_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(read_guard),
):
    production_order_service.get_production_order(db, production_order_id)  # 404s if missing
    return production_order_material_service.get_requirement_summary(db, production_order_id)


@router.post("/{production_order_id}/material-requirements/calculate", response_model=MaterialRequirementSummaryOut)
def calculate_material_requirements(
    production_order_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    production_order_material_service.calculate(db, production_order_id, user_id=user.id)
    return production_order_material_service.get_requirement_summary(db, production_order_id)


@router.post(
    "/{production_order_id}/material-requirements/{requirement_id}/allocate",
    response_model=MaterialRequirementSummaryOut,
)
def allocate_material(
    production_order_id: int,
    requirement_id: int,
    payload: MaterialAllocationRequest,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    return production_order_material_service.allocate(
        db, production_order_id, requirement_id, payload.quantity, user_id=user.id
    )


@router.post(
    "/{production_order_id}/material-requirements/{requirement_id}/release",
    response_model=MaterialRequirementSummaryOut,
)
def release_material(
    production_order_id: int,
    requirement_id: int,
    payload: MaterialAllocationRequest,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    return production_order_material_service.release(
        db, production_order_id, requirement_id, payload.quantity, user_id=user.id
    )


def _schedule_summary_out(summary: dict) -> ProductionOrderScheduleSummaryOut:
    return ProductionOrderScheduleSummaryOut(
        production_order_id=summary["production_order_id"],
        due_date=summary["due_date"],
        planned_quantity=summary["planned_quantity"],
        scheduled_quantity=summary["scheduled_quantity"],
        remaining_to_schedule=summary["remaining_to_schedule"],
        schedule_status=summary["schedule_status"],
        schedules=[
            ProductionOrderScheduleItemOut.from_schedule(s, summary["due_date"]) for s in summary["schedules"]
        ],
    )


@router.get("/{production_order_id}/schedules", response_model=ProductionOrderScheduleSummaryOut)
def get_schedules(
    production_order_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(read_guard),
):
    summary = production_order_schedule_service.get_schedule_summary(db, production_order_id)
    return _schedule_summary_out(summary)


@router.post("/{production_order_id}/schedules", response_model=ProductionOrderScheduleSummaryOut, status_code=201)
def create_schedule(
    production_order_id: int,
    payload: ProductionOrderScheduleCreate,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    production_order_schedule_service.create_schedule(
        db, production_order_id, payload.model_dump(exclude_unset=True), user_id=user.id
    )
    return _schedule_summary_out(production_order_schedule_service.get_schedule_summary(db, production_order_id))


@router.put("/{production_order_id}/schedules/{schedule_id}", response_model=ProductionOrderScheduleSummaryOut)
def update_schedule(
    production_order_id: int,
    schedule_id: int,
    payload: ProductionOrderScheduleUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    production_order_schedule_service.reschedule(
        db, schedule_id, payload.model_dump(exclude_unset=True), user_id=user.id
    )
    return _schedule_summary_out(production_order_schedule_service.get_schedule_summary(db, production_order_id))


@router.post(
    "/{production_order_id}/schedules/{schedule_id}/cancel", response_model=ProductionOrderScheduleSummaryOut
)
def cancel_schedule(
    production_order_id: int,
    schedule_id: int,
    payload: ProductionOrderScheduleCancel,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    production_order_schedule_service.cancel_schedule(db, schedule_id, payload.reason, user_id=user.id)
    return _schedule_summary_out(production_order_schedule_service.get_schedule_summary(db, production_order_id))


def _execution_summary_out(db: Session, summary: dict) -> ProductionExecutionSummaryOut:
    # fg_release_status is computed here, not in ProductionExecutionOut.
    # from_model, since it needs a query across qc_requests -- same
    # "populated by the endpoint" pattern production_schedules.py's own
    # readiness_status already uses (see that schema's own comment).
    fg_release_statuses = qc_service.get_fg_release_statuses(db, summary["production_order_id"])
    qc_quantities = qc_service.get_qc_quantities(db, summary["production_order_id"])
    runs = []
    for r in summary["runs"]:
        out = ProductionExecutionOut.from_model(r)
        out.fg_release_status = fg_release_statuses.get(r.id, "not_applicable")
        runs.append(out)
    return ProductionExecutionSummaryOut(
        production_order_id=summary["production_order_id"],
        planned_quantity=summary["planned_quantity"],
        total_produced=summary["total_produced"],
        remaining_to_produce=summary["remaining_to_produce"],
        execution_status=summary["execution_status"],
        qc_pending=qc_quantities["pending"],
        qc_released=qc_quantities["released"],
        qc_rejected=qc_quantities["rejected"],
        runs=runs,
    )


@router.get("/{production_order_id}/executions", response_model=ProductionExecutionSummaryOut)
def get_executions(
    production_order_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(read_guard),
):
    return _execution_summary_out(db, production_execution_service.get_progress(db, production_order_id))


@router.post("/{production_order_id}/executions", response_model=ProductionExecutionSummaryOut, status_code=201)
def start_execution(
    production_order_id: int,
    payload: ProductionExecutionStart,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    production_execution_service.start_execution(
        db, production_order_id, payload.schedule_id, planned_quantity=payload.planned_quantity, user_id=user.id
    )
    return _execution_summary_out(db, production_execution_service.get_progress(db, production_order_id))


@router.post(
    "/{production_order_id}/executions/{execution_id}/complete", response_model=ProductionExecutionSummaryOut
)
def complete_execution(
    production_order_id: int,
    execution_id: int,
    payload: ProductionExecutionComplete,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    production_execution_service.complete_execution(
        db, execution_id, payload.produced_quantity, user_id=user.id
    )
    return _execution_summary_out(db, production_execution_service.get_progress(db, production_order_id))


@router.post(
    "/{production_order_id}/executions/{execution_id}/cancel", response_model=ProductionExecutionSummaryOut
)
def cancel_execution(
    production_order_id: int,
    execution_id: int,
    payload: ProductionExecutionCancel,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    production_execution_service.cancel_execution(db, execution_id, payload.reason, user_id=user.id)
    return _execution_summary_out(db, production_execution_service.get_progress(db, production_order_id))


@router.post("/{production_order_id}/status", response_model=ProductionOrderOut)
def update_status(
    production_order_id: int,
    payload: ProductionOrderStatusUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(write_guard),
):
    po = production_order_service.change_status(
        db, production_order_id, payload.status, reason=payload.reason, user_id=user.id
    )
    return _with_remaining(db, po, ProductionOrderOut.from_model(po))
