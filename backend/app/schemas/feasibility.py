from datetime import date, datetime

from pydantic import BaseModel, Field, field_validator

from app.core.validators import not_in_past


class FeasibilityLineIn(BaseModel):
    product_id: int
    quantity: float = Field(gt=0)


class ShortfallItem(BaseModel):
    raw_material_id: int
    code: str
    name: str
    unit: str
    required: float
    on_hand: float
    shortfall: float


class CapacityShortfall(BaseModel):
    machine: str
    required_hours: float
    # Earliest date the machine + labor pool could actually finish this,
    # given what's already booked -- None if not achievable within the
    # scan horizon at all.
    projected_completion_date: date | None
    shortfall_days: int | None
    workers_required: int | None = None
    required_worker_hours: float | None = None


class FeasibilityLineOut(BaseModel):
    id: int
    product_id: int
    product_code: str | None = None
    product_name: str | None = None
    quantity: float
    is_feasible: bool | None
    shortfalls: list[ShortfallItem] = []
    capacity_ok: bool | None
    capacity_shortfall: CapacityShortfall | None = None

    model_config = {"from_attributes": True}


class FeasibilityCreate(BaseModel):
    customer_id: int
    required_by_date: date | None = None
    notes: str | None = None
    lines: list[FeasibilityLineIn] = Field(min_length=1)

    @field_validator("required_by_date")
    @classmethod
    def _required_by_date_not_past(cls, v: date | None) -> date | None:
        return not_in_past(v)

    @field_validator("lines")
    @classmethod
    def _lines_not_empty(cls, v: list[FeasibilityLineIn]) -> list[FeasibilityLineIn]:
        if not v:
            raise ValueError("At least one product line is required.")
        return v


class FeasibilityExceptionDecision(BaseModel):
    approve: bool
    reason: str = Field(min_length=1)


class FeasibilityClose(BaseModel):
    reason: str = Field(min_length=1)


class FeasibilityAdminReview(BaseModel):
    notes: str = Field(min_length=1)


class FeasibilityOut(BaseModel):
    id: int
    feasibility_number: str
    customer_id: int
    customer_name: str | None = None
    deal_id: int | None
    deal_number: str | None = None
    status: str
    required_by_date: date | None
    checked_at: datetime | None
    exception_reason: str | None
    close_reason: str | None
    notes: str | None
    admin_review_required: bool
    admin_review_reason: str | None
    admin_reviewed_at: datetime | None
    admin_review_notes: str | None
    lines: list[FeasibilityLineOut] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @staticmethod
    def from_model(obj) -> "FeasibilityOut":
        import json

        data = FeasibilityOut.model_validate(obj)
        data.customer_name = obj.customer.name if obj.customer else None
        data.deal_number = obj.deal.deal_number if obj.deal else None
        for line, src in zip(data.lines, obj.lines):
            line.product_code = src.product.code if src.product else None
            line.product_name = src.product.name if src.product else None
            line.shortfalls = json.loads(src.shortfall_json) if src.shortfall_json else []
            line.capacity_shortfall = (
                json.loads(src.capacity_shortfall_json) if src.capacity_shortfall_json else None
            )
        return data
