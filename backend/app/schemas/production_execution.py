from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ProductionExecutionStart(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    schedule_id: int = Field(gt=0)
    # Defaults to whatever's still unproduced on the production order
    # when omitted -- see production_execution_service.start_execution.
    planned_quantity: float | None = Field(default=None, gt=0)


class ProductionExecutionComplete(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    produced_quantity: float = Field(gt=0)


class ProductionExecutionCancel(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    reason: str = Field(min_length=1, max_length=5000)


class ProductionExecutionOut(BaseModel):
    id: int
    production_order_id: int
    schedule_id: int
    batch_number: str | None = None
    product_id: int
    product_code: str | None = None
    product_name: str | None = None
    unit: str | None = None
    machine_id: int | None
    machine_name: str | None = None
    planned_quantity: float
    produced_quantity: float
    # How much of produced_quantity has been released into
    # FinishedGoodsInventory by an accepted external QC report (P7) --
    # see app/models/production_execution.py's own comment.
    released_quantity: float = 0
    # released_quantity's sibling (P8) -- how much a QC decision has
    # instead rejected.
    rejected_quantity: float = 0
    # 'not_applicable' (not completed yet) | 'not_requested' |
    # 'pending' | 'partially_released' | 'released' | 'rejected' --
    # derived from this run's QC requests (qc_service), never stored
    # here. Populated by the production-orders API, not from_model,
    # since it needs a query across qc_requests -- see
    # api/production_orders.py's _execution_summary_out (same
    # "populated by the endpoint, not the model conversion" pattern
    # production_schedules.py's readiness_status already uses).
    fg_release_status: str = "not_applicable"
    started_at: datetime
    ended_at: datetime | None
    # Server-computed, in seconds -- see ProductionExecutionOut.from_model.
    # None while still in_progress (duration isn't known yet).
    duration_seconds: float | None = None
    status: str
    started_by: int | None
    completed_by: int | None
    cancel_reason: str | None
    notes: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @staticmethod
    def from_model(obj) -> "ProductionExecutionOut":
        data = ProductionExecutionOut.model_validate(obj)
        data.batch_number = obj.schedule.batch_number if obj.schedule else None
        data.product_code = obj.product.code if obj.product else None
        data.product_name = obj.product.name if obj.product else None
        data.unit = obj.product.unit if obj.product else None
        data.machine_name = obj.machine.name if obj.machine else None
        if obj.ended_at:
            data.duration_seconds = (obj.ended_at - obj.started_at).total_seconds()
        return data


class ProductionExecutionSummaryOut(BaseModel):
    production_order_id: int
    planned_quantity: float
    total_produced: float
    remaining_to_produce: float
    # 'not_started' | 'in_progress' | 'partially_completed' | 'completed'
    # -- see production_execution_service.get_progress for what each
    # means; deliberately never confused with the Production Order's own
    # planned/cancelled status (spec P6 section 3).
    execution_status: str
    # P8: aggregate QC breakdown across every completed run under this
    # Production Order -- see qc_service.get_qc_quantities. qc_released
    # doubles as "FG received" (release always immediately creates the
    # matching inventory receipt -- see qc_service._release_execution_fg
    # -- so there is no separate figure to show).
    qc_pending: float = 0
    qc_released: float = 0
    qc_rejected: float = 0
    runs: list[ProductionExecutionOut]
