import json
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.validators import not_in_past


class ProductionMaterialActual(BaseModel):
    raw_material_id: int = Field(gt=0)
    quantity_used: float = Field(ge=0)


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

    status: str = Field(pattern="^(in_progress|completed|cancelled)$")
    # Only required (and only used) when status == 'completed': the real
    # output of the batch, which may differ from planned_quantity.
    produced_quantity: float | None = Field(default=None, gt=0)
    # Optional, only used when status == 'completed': actual raw material
    # consumed, per material -- any material not listed here is deducted
    # at its BOM-calculated (scrap-inflated) figure instead, same as
    # before this existed. Given figures drive the scrap-allowance-breach
    # and material-discrepancy checks (see production_service._complete_batch).
    actual_materials: list[ProductionMaterialActual] | None = None
    # Required when status == 'cancelled' (enforced in the service layer).
    reason: str | None = Field(default=None, max_length=5000)


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
    actual_start: datetime | None
    actual_end: datetime | None
    status: str
    auto_scheduled: bool
    cancel_reason: str | None
    notes: str | None
    material_discrepancy_flag: bool
    # Deliberately not named material_discrepancy_notes (the ORM column
    # it's parsed from) -- from_attributes model_validate would otherwise
    # try to coerce that raw JSON *string* directly into this list field
    # and fail before from_model ever gets to parse it. Same reason
    # FeasibilityLineOut's `shortfalls` isn't named shortfall_json.
    material_discrepancy_findings: list[dict] | None = None
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
