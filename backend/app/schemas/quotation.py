import json
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.core.validators import not_in_past


class QuotationLineIn(BaseModel):
    product_id: int
    quantity: float = Field(gt=0)
    unit_price: float = Field(ge=0)
    # Percentage, e.g. 0 or 10 -- this line's own discount.
    discount_percent: float = Field(default=0, ge=0, le=100)


class QuotationLineOut(BaseModel):
    id: int
    product_id: int
    product_code: str | None = None
    product_name: str | None = None
    unit: str | None = None
    quantity: float
    unit_price: float
    discount_percent: float
    line_total: float

    model_config = {"from_attributes": True}


class QuotationCreate(BaseModel):
    customer_id: int
    # A passed (or exception-approved) feasibility check this quotation is
    # generated from -- optional for UI form submission, required in workflows.
    feasibility_id: int | None = None
    quotation_date: date
    valid_until: date | None = None
    notes: str | None = None
    # Percentage, e.g. 0 or 5. Defaults to 0 when not given.
    discount_percent: float | None = Field(default=None, ge=0, le=100)
    lines: list[QuotationLineIn] = Field(min_length=1)
    # Which admin-uploaded template (see doc_template_service.LANGUAGES)
    # this quotation is raised in -- drives the default language for
    # Print/Email. Sales' choice on the form, not the customer's.
    language: Literal["en", "ar"] = "en"
    # Must be true if quotation_service.check_material_conflicts finds
    # this quotation's material needs overlapping another still-open
    # quotation/order -- Sales explicitly proceeding despite the overlap.
    # Ignored (no gate) when there's no conflict to begin with.
    material_conflict_acknowledged: bool = False

    @field_validator("quotation_date", "valid_until")
    @classmethod
    def _dates_not_past(cls, v: date | None) -> date | None:
        return not_in_past(v)

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
    discount_percent: float | None = Field(default=None, ge=0, le=100)
    lines: list[QuotationLineIn] | None = Field(default=None, min_length=1)
    language: Literal["en", "ar"] | None = None
    material_conflict_acknowledged: bool = False

    @field_validator("quotation_date", "valid_until")
    @classmethod
    def _dates_not_past(cls, v: date | None) -> date | None:
        return not_in_past(v)


class QuotationStatusUpdate(BaseModel):
    """'converted' is deliberately excluded: it's only ever set by
    create_order_from_quotation, which also links converted_order_id."""

    status: str = Field(pattern="^(sent|accepted|rejected|expired)$")
    # Required by the service layer when status == 'rejected' (Sales closing
    # the quotation without an order); ignored otherwise.
    reason: str | None = None


class MaterialConflictLineIn(BaseModel):
    """One line of a not-yet-created quotation, for the live
    material-conflict pre-check -- see POST /api/quotations/material-conflicts."""

    product_id: int
    quantity: float = Field(gt=0)


class MaterialConflictCheckRequest(BaseModel):
    lines: list[MaterialConflictLineIn] = Field(min_length=1)
    # When checking an existing draft quotation's edited lines, leave that
    # quotation's own demand out of "other open quotations" -- otherwise
    # it would flag itself against its own current lines.
    exclude_quotation_id: int | None = None


class MaterialConflictCompetitor(BaseModel):
    quotation_id: int
    quotation_number: str


class MaterialConflictOut(BaseModel):
    raw_material_id: int
    code: str
    name: str
    unit: str
    required_by_this: float
    available: float
    shortfall: float
    competing_quotations: list[MaterialConflictCompetitor]


class QuotationOut(BaseModel):
    id: int
    quotation_number: str
    customer_id: int
    customer_name: str | None = None
    customer_email: str | None = None
    deal_id: int | None
    deal_number: str | None = None
    quotation_date: date
    valid_until: date | None
    status: str
    language: str
    subtotal_amount: float
    discount_percent: float
    discount_amount: float
    total_amount: float
    notes: str | None
    converted_order_id: int | None
    feasibility_id: int | None
    auto_created: bool
    close_reason: str | None
    approved_at: datetime | None
    material_conflict_acknowledged: bool
    # Deliberately not named material_conflict_notes (the ORM column it's
    # parsed from) -- from_attributes model_validate would otherwise try
    # to coerce that raw JSON *string* directly into this list field and
    # fail before from_model ever gets to parse it.
    material_conflict_details: list[MaterialConflictOut] | None = None
    lines: list[QuotationLineOut] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @staticmethod
    def from_model(obj) -> "QuotationOut":
        data = QuotationOut.model_validate(obj)
        data.customer_name = obj.customer.name if obj.customer else None
        data.customer_email = obj.customer.email if obj.customer else None
        data.deal_number = obj.deal.deal_number if obj.deal else None
        data.material_conflict_details = (
            json.loads(obj.material_conflict_notes) if obj.material_conflict_notes else None
        )
        for line, src in zip(data.lines, obj.lines):
            line.product_code = src.product.code if src.product else None
            line.product_name = src.product.name if src.product else None
            line.unit = src.product.unit if src.product else None
        return data
