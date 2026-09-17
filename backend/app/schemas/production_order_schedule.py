from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.production_schedule import ProductionScheduleOut


class ProductionOrderScheduleCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    # Defaults to the product's own default machine (Product.machine_id)
    # when omitted -- same convention production_service.create_batch
    # already uses. This factory runs a single Production Line (see
    # app/models/machine.py), so there is rarely a real choice to make.
    machine_id: int | None = Field(default=None, gt=0)
    # Defaults to whatever's still unscheduled on the production order
    # when omitted -- lets "schedule the rest of it" be a one-field call.
    planned_quantity: float | None = Field(default=None, gt=0)
    planned_start: datetime
    # Computed from the product's production rate (hours per unit) when
    # omitted -- see production_order_schedule_service._compute_planned_end.
    # Given explicitly here to let the UI show/adjust the computed figure
    # before submitting.
    planned_end: datetime | None = None
    notes: str | None = Field(default=None, max_length=5000)


class ProductionOrderScheduleUpdate(BaseModel):
    """Only a still-planned schedule may be modified (enforced in the
    service layer). Every field is optional -- omitted ones keep the
    schedule's current value, except planned_end, which is *recomputed*
    from the (possibly new) quantity/start whenever it isn't given
    explicitly, exactly like creation."""

    model_config = ConfigDict(str_strip_whitespace=True)

    machine_id: int | None = Field(default=None, gt=0)
    planned_quantity: float | None = Field(default=None, gt=0)
    planned_start: datetime | None = None
    planned_end: datetime | None = None
    notes: str | None = Field(default=None, max_length=5000)


class ProductionOrderScheduleCancel(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    reason: str = Field(min_length=1, max_length=5000)


class ProductionOrderScheduleItemOut(ProductionScheduleOut):
    # How this schedule's own completion compares to the Production
    # Order's due date -- computed here (not stored) so the UI never has
    # to derive it itself and risk a silently wrong comparison (spec
    # section 5's "no silent false indication that the order will meet
    # its due date").
    due_date_status: str = "on_or_before_due"

    @staticmethod
    def from_schedule(obj, due_date: date) -> "ProductionOrderScheduleItemOut":
        base = ProductionScheduleOut.from_model(obj)
        data = ProductionOrderScheduleItemOut(**base.model_dump())
        data.due_date_status = "after_due" if obj.scheduled_end > due_date else "on_or_before_due"
        return data


class ProductionOrderScheduleSummaryOut(BaseModel):
    production_order_id: int
    due_date: date
    planned_quantity: float
    scheduled_quantity: float
    remaining_to_schedule: float
    # 'unscheduled' | 'scheduled' | 'cancelled' -- see
    # production_order_schedule_service.get_schedule_summary's own
    # comment on why this stays a 3-state verdict, not a richer one.
    schedule_status: str
    schedules: list[ProductionOrderScheduleItemOut]
