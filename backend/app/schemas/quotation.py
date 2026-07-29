from datetime import date, datetime

from pydantic import BaseModel, Field, field_validator


class QuotationLineIn(BaseModel):
    product_id: int
    quantity: float = Field(gt=0)
    unit_price: float = Field(ge=0)


class QuotationLineOut(BaseModel):
    id: int
    product_id: int
    product_code: str | None = None
    product_name: str | None = None
    unit: str | None = None
    quantity: float
    unit_price: float
    line_total: float

    model_config = {"from_attributes": True}


class QuotationCreate(BaseModel):
    customer_id: int
    # A passed (or exception-approved) feasibility check this quotation is
    # generated from -- required, see quotation_service.create_quotation.
    feasibility_id: int
    quotation_date: date
    valid_until: date | None = None
    notes: str | None = None
    lines: list[QuotationLineIn] = Field(min_length=1)

    @field_validator("lines")
    @classmethod
    def _lines_not_empty(cls, v: list[QuotationLineIn]) -> list[QuotationLineIn]:
        if not v:
            raise ValueError("At least one line item is required.")
        return v


class QuotationUpdate(BaseModel):
    """Only draft quotations may be edited (enforced in the service layer)."""

    customer_id: int | None = None
    quotation_date: date | None = None
    valid_until: date | None = None
    notes: str | None = None
    lines: list[QuotationLineIn] | None = Field(default=None, min_length=1)


class QuotationStatusUpdate(BaseModel):
    """'converted' is deliberately excluded: it's only ever set by
    create_order_from_quotation, which also links converted_order_id."""

    status: str = Field(pattern="^(sent|accepted|rejected|expired)$")
    # Required by the service layer when status == 'rejected' (Sales closing
    # the quotation without an order); ignored otherwise.
    reason: str | None = None


class QuotationOut(BaseModel):
    id: int
    quotation_number: str
    customer_id: int
    customer_name: str | None = None
    customer_email: str | None = None
    quotation_date: date
    valid_until: date | None
    status: str
    total_amount: float
    notes: str | None
    converted_order_id: int | None
    feasibility_id: int | None
    close_reason: str | None
    lines: list[QuotationLineOut] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @staticmethod
    def from_model(obj) -> "QuotationOut":
        data = QuotationOut.model_validate(obj)
        data.customer_name = obj.customer.name if obj.customer else None
        data.customer_email = obj.customer.email if obj.customer else None
        for line, src in zip(data.lines, obj.lines):
            line.product_code = src.product.code if src.product else None
            line.product_name = src.product.name if src.product else None
            line.unit = src.product.unit if src.product else None
        return data
