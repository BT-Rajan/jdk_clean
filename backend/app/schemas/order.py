from datetime import date, datetime

from pydantic import BaseModel, Field, field_validator


class OrderLineIn(BaseModel):
    product_id: int
    quantity: float = Field(gt=0)
    unit_price: float = Field(ge=0)


class OrderLineOut(BaseModel):
    id: int
    product_id: int
    product_code: str | None = None
    product_name: str | None = None
    unit: str | None = None
    quantity: float
    unit_price: float
    line_total: float

    model_config = {"from_attributes": True}


class OrderCreate(BaseModel):
    customer_id: int
    order_date: date
    requested_delivery_date: date | None = None
    notes: str | None = None
    lines: list[OrderLineIn] = Field(min_length=1)

    @field_validator("lines")
    @classmethod
    def _lines_not_empty(cls, v: list[OrderLineIn]) -> list[OrderLineIn]:
        if not v:
            raise ValueError("At least one line item is required.")
        return v


class OrderUpdate(BaseModel):
    """Only draft orders may be edited (enforced in the service layer)."""

    customer_id: int | None = None
    order_date: date | None = None
    requested_delivery_date: date | None = None
    confirmed_delivery_date: date | None = None
    notes: str | None = None
    lines: list[OrderLineIn] | None = Field(default=None, min_length=1)


class OrderStatusUpdate(BaseModel):
    status: str = Field(
        pattern="^(confirmed|in_production|ready_to_ship|shipped|delivered|cancelled)$"
    )


class OrderOut(BaseModel):
    id: int
    order_number: str
    customer_id: int
    customer_name: str | None = None
    order_date: date
    requested_delivery_date: date | None
    confirmed_delivery_date: date | None
    status: str
    total_amount: float
    notes: str | None
    lines: list[OrderLineOut] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @staticmethod
    def from_model(obj) -> "OrderOut":
        data = OrderOut.model_validate(obj)
        data.customer_name = obj.customer.name if obj.customer else None
        for line, src in zip(data.lines, obj.lines):
            line.product_code = src.product.code if src.product else None
            line.product_name = src.product.name if src.product else None
            line.unit = src.product.unit if src.product else None
        return data
