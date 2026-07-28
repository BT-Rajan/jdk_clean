from datetime import date, datetime

from pydantic import BaseModel, Field, field_validator


class ProductionScheduleCreate(BaseModel):
    product_id: int
    order_id: int | None = None
    planned_quantity: float = Field(gt=0)
    scheduled_start: date
    scheduled_end: date
    notes: str | None = None

    @field_validator("scheduled_end")
    @classmethod
    def _end_not_before_start(cls, v: date, info) -> date:
        start = info.data.get("scheduled_start")
        if start is not None and v < start:
            raise ValueError("scheduled_end cannot be before scheduled_start.")
        return v


class ProductionScheduleUpdate(BaseModel):
    """Only 'planned' batches may be edited (enforced in the service layer)."""

    order_id: int | None = None
    planned_quantity: float | None = Field(default=None, gt=0)
    scheduled_start: date | None = None
    scheduled_end: date | None = None
    notes: str | None = None


class ProductionScheduleStatusUpdate(BaseModel):
    status: str = Field(pattern="^(in_progress|completed|cancelled)$")
    # Only required (and only used) when status == 'completed': the real
    # output of the batch, which may differ from planned_quantity.
    produced_quantity: float | None = Field(default=None, gt=0)


class ProductionScheduleOut(BaseModel):
    id: int
    batch_number: str
    product_id: int
    product_code: str | None = None
    product_name: str | None = None
    unit: str | None = None
    order_id: int | None
    order_number: str | None = None
    planned_quantity: float
    produced_quantity: float
    scheduled_start: date
    scheduled_end: date
    actual_start: datetime | None
    actual_end: datetime | None
    status: str
    notes: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @staticmethod
    def from_model(obj) -> "ProductionScheduleOut":
        data = ProductionScheduleOut.model_validate(obj)
        data.product_code = obj.product.code if obj.product else None
        data.product_name = obj.product.name if obj.product else None
        data.unit = obj.product.unit if obj.product else None
        data.order_number = obj.order.order_number if obj.order else None
        return data
