from datetime import datetime

from pydantic import BaseModel, Field, field_validator


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


class FeasibilityLineOut(BaseModel):
    id: int
    product_id: int
    product_code: str | None = None
    product_name: str | None = None
    quantity: float
    is_feasible: bool | None
    shortfalls: list[ShortfallItem] = []

    model_config = {"from_attributes": True}


class FeasibilityCreate(BaseModel):
    customer_id: int
    notes: str | None = None
    lines: list[FeasibilityLineIn] = Field(min_length=1)

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


class FeasibilityOut(BaseModel):
    id: int
    feasibility_number: str
    customer_id: int
    customer_name: str | None = None
    status: str
    checked_at: datetime | None
    exception_reason: str | None
    close_reason: str | None
    notes: str | None
    lines: list[FeasibilityLineOut] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @staticmethod
    def from_model(obj) -> "FeasibilityOut":
        import json

        data = FeasibilityOut.model_validate(obj)
        data.customer_name = obj.customer.name if obj.customer else None
        for line, src in zip(data.lines, obj.lines):
            line.product_code = src.product.code if src.product else None
            line.product_name = src.product.name if src.product else None
            line.shortfalls = json.loads(src.shortfall_json) if src.shortfall_json else []
        return data
