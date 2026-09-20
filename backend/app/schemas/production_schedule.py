import json
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.validators import not_in_past
from app.services import production_service


class ProductionMaterialActual(BaseModel):
    # The material actually consumed -- ordinarily the BOM's own
    # material, but when substituted_for_raw_material_id is set, this is
    # an approved alternative (see raw_material_alternatives) used in
    # its place. The BOM itself is never changed by this -- only the
    # batch's actual consumption record. See
    # production_service._record_output.
    raw_material_id: int = Field(gt=0)
    quantity_used: float = Field(ge=0)
    substituted_for_raw_material_id: int | None = Field(default=None, gt=0)


class ProductionScheduleCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    product_id: int = Field(gt=0)
    machine_id: int | None = Field(default=None, gt=0)
    order_id: int | None = Field(default=None, gt=0)
    planned_quantity: float = Field(gt=0)
    scheduled_start: date
    scheduled_end: date
    notes: str | None = Field(default=None, max_length=5000)

    @field_validator("scheduled_start")
    @classmethod
    def _start_not_past(cls, v: date) -> date:
        return not_in_past(v)

    @field_validator("scheduled_end")
    @classmethod
    def _end_not_before_start(cls, v: date, info) -> date:
        start = info.data.get("scheduled_start")
        if start is not None and v < start:
            raise ValueError("scheduled_end cannot be before scheduled_start.")
        return v


class ProductionScheduleUpdate(BaseModel):
    """Only 'planned' batches may be edited (enforced in the service layer)."""

    model_config = ConfigDict(str_strip_whitespace=True)

    order_id: int | None = Field(default=None, gt=0)
    machine_id: int | None = Field(default=None, gt=0)
    planned_quantity: float | None = Field(default=None, gt=0)
    scheduled_start: date | None = None
    scheduled_end: date | None = None
    notes: str | None = Field(default=None, max_length=5000)

    @field_validator("scheduled_start", "scheduled_end")
    @classmethod
    def _dates_not_past(cls, v: date | None) -> date | None:
        return not_in_past(v)


class ProductionQuickLog(BaseModel):
    """Log a batch that's already happened -- e.g. entering today's
    output at day's end -- in one call instead of planning a batch and
    clicking through in_progress/completed by hand. Always runs on the
    product's own default machine and isn't tied to an order (see
    production_service.log_production)."""

    model_config = ConfigDict(str_strip_whitespace=True)

    product_id: int = Field(gt=0)
    quantity: float = Field(gt=0)
    notes: str | None = Field(default=None, max_length=5000)
    # Defaults to today when omitted (the Production list's button);
    # the calendar's day-actions popup sends the clicked day instead.
    # Validated server-side against MAX_BACKDATE_DAYS -- see
    # production_service.log_production.
    entry_date: date | None = None


class ProductionScheduleStatusUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    status: str = Field(pattern="^(in_progress|paused|completed|cancelled)$")
    # Only used when status == 'completed': this round's real output on
    # top of whatever's already been recorded via log_partial_production
    # (if anything) -- may be omitted entirely when closing out a batch
    # that's already had everything it produced logged that way. See
    # production_service.change_status.
    produced_quantity: float | None = Field(default=None, gt=0)
    # Optional, only used when status == 'completed': actual raw material
    # consumed, per material, for produced_quantity above -- any material
    # not listed here is deducted at its BOM-calculated (scrap-inflated)
    # figure instead, same as before this existed. Given figures drive
    # the scrap-allowance-breach and material-discrepancy checks (see
    # production_service._record_output).
    actual_materials: list[ProductionMaterialActual] | None = None
    # Required when status == 'cancelled' or 'paused' (why production is
    # stopping/pausing), and conditionally when status == 'completed'
    # with a produced_quantity that differs from planned_quantity (why
    # actual output didn't match the plan) -- all enforced in the
    # service layer, see change_status.
    reason: str | None = Field(default=None, max_length=5000)


class ProductionAdminReview(BaseModel):
    notes: str = Field(min_length=1)


class ProductionLogOutput(BaseModel):
    """Records output produced so far without closing the batch out --
    see production_service.log_partial_production."""

    model_config = ConfigDict(str_strip_whitespace=True)

    quantity: float = Field(gt=0)
    actual_materials: list[ProductionMaterialActual] | None = None


class OrderProductQuantitySummary(BaseModel):
    """ordered / scheduled / produced / remaining for one order+product
    combination -- see production_service.get_order_product_quantity_summary."""

    ordered: float
    scheduled: float
    produced: float
    remaining: float


class MachineConflictOut(BaseModel):
    """Another booked batch sharing this batch's machine with an
    overlapping scheduled window -- see
    production_service.get_machine_conflicts."""

    id: int
    batch_number: str
    scheduled_start: date
    scheduled_end: date


class ProductionScheduleOut(BaseModel):
    id: int
    batch_number: str
    product_id: int
    product_code: str | None = None
    product_name: str | None = None
    unit: str | None = None
    machine_id: int | None
    machine_name: str | None = None
    order_id: int | None
    order_number: str | None = None
    planned_quantity: float
    produced_quantity: float
    scheduled_start: date
    scheduled_end: date
    # Time-of-day precision -- only set for a schedule created through
    # the Production Order flow (P5); None for a legacy batch that only
    # ever recorded a calendar day. See app/models/production_schedule.py.
    planned_start: datetime | None = None
    planned_end: datetime | None = None
    production_order_id: int | None = None
    actual_start: datetime | None
    actual_end: datetime | None
    status: str
    auto_scheduled: bool
    cancel_reason: str | None
    pause_reason: str | None
    quantity_discrepancy_reason: str | None
    overproduction_reason: str | None = None
    notes: str | None
    material_discrepancy_flag: bool
    # Deliberately not named material_discrepancy_notes (the ORM column
    # it's parsed from) -- from_attributes model_validate would otherwise
    # try to coerce that raw JSON *string* directly into this list field
    # and fail before from_model ever gets to parse it. Same reason
    # FeasibilityLineOut's `shortfalls` isn't named shortfall_json.
    material_discrepancy_findings: list[dict] | None = None
    admin_review_required: bool
    admin_reviewed_at: datetime | None
    admin_review_notes: str | None
    # "Can this batch start right now" -- one of production_readiness's
    # READINESS_STATUSES, or None when the batch isn't 'planned' (the
    # question is moot once it's started/completed/cancelled). Populated
    # by the list/get endpoints via production_readiness_service.quick_status,
    # not stored -- see production_readiness_service for why.
    readiness_status: str | None = None
    # Only set on the response to the status-change call that just
    # cancelled this batch, and only when it was tied to a still-active
    # order -- how much of that order's demand for this product now has
    # no batch scheduled against it at all. See
    # production_service.get_resulting_unscheduled_quantity. None in
    # every other case (not cancelled, no order, or the order's no
    # longer active) -- not stored, populated by the status endpoint.
    resulting_unscheduled_quantity: float | None = None
    # ordered / scheduled / produced / remaining for this batch's own
    # order+product -- see production_service.get_order_product_quantity_summary.
    # Only set on the single-batch GET (the per-row cost isn't worth
    # paying on every list row); None for a batch with no order_id.
    order_quantity_summary: OrderProductQuantitySummary | None = None
    # How many days past scheduled_end this batch is right now -- see
    # production_service.get_days_overdue. Computed fresh on every
    # response (pure date math, no extra query), None once closed out or
    # not overdue.
    days_overdue: int | None = None
    # Other booked batches sharing this batch's machine with an
    # overlapping window -- see production_service.get_machine_conflicts.
    # Only set on the single-batch GET (needs its own query); None/empty
    # on list rows.
    machine_conflicts: list[MachineConflictOut] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @staticmethod
    def from_model(obj) -> "ProductionScheduleOut":
        data = ProductionScheduleOut.model_validate(obj)
        data.product_code = obj.product.code if obj.product else None
        data.product_name = obj.product.name if obj.product else None
        data.unit = obj.product.unit if obj.product else None
        data.machine_name = obj.machine.name if obj.machine else None
        data.order_number = obj.order.order_number if obj.order else None
        data.days_overdue = production_service.get_days_overdue(obj)
        data.material_discrepancy_findings = (
            json.loads(obj.material_discrepancy_notes) if obj.material_discrepancy_notes else None
        )
        return data


class MaterialRequirementOut(BaseModel):
    raw_material_id: int
    code: str
    name: str
    unit: str
    net_required: float
    planned_required: float
    current_on_hand: float
