from datetime import date, datetime

from pydantic import BaseModel, Field, field_validator

from app.core.validators import not_in_past


class FeasibilityLineIn(BaseModel):
    product_id: int
    quantity: float = Field(gt=0)


class SupplierSuggestion(BaseModel):
    supplier_id: int
    supplier_code: str
    supplier_name: str
    # Portion of this material's remaining shortfall this supplier would
    # cover -- not the material's total requirement or its own-stock
    # shortfall, just what's genuinely still needed after alternatives.
    quantity: float
    lead_time_days: int | None
    mode_of_supply: str | None = None


class ProcurementProjection(BaseModel):
    # False when no supplier could be found for the full remaining
    # shortfall, or a supplier actually needed to cover it has no
    # recorded lead time -- in either case expected_available_date is
    # None rather than a fabricated guess.
    date_known: bool
    expected_available_date: date | None
    suppliers: list[SupplierSuggestion] = []


class ShortfallItem(BaseModel):
    raw_material_id: int
    code: str
    name: str
    unit: str
    required: float
    on_hand: float
    shortfall: float
    # Present once run_check has looked for a supplier -- absent (None)
    # only for shortfalls computed before this pass existed.
    procurement: ProcurementProjection | None = None


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
    # Which axis actually missed the deadline -- lets callers say "machine
    # slot" or "manpower" specifically instead of a generic shortfall.
    # Defaults keep this optional for any capacity_shortfall_json written
    # before these fields existed.
    machine_available: bool = True
    workers_available: bool | None = None


class AlternativeUsed(BaseModel):
    raw_material_id: int
    code: str
    name: str
    unit: str
    priority: int
    conversion_ratio: float
    available: float
    quantity_used: float
    quantity_covered: float


class AlternativeCoverageItem(BaseModel):
    raw_material_id: int
    code: str
    name: str
    unit: str
    original_shortfall: float
    covered_by_alternatives: float
    remaining_shortfall: float
    alternatives_used: list[AlternativeUsed] = []


class FeasibilityLineOut(BaseModel):
    id: int
    product_id: int
    product_code: str | None = None
    product_name: str | None = None
    quantity: float
    covered_by_stock: float | None
    bom_missing: bool | None
    is_feasible: bool | None
    shortfalls: list[ShortfallItem] = []
    # Materials whose own-stock shortfall was fully or partially covered
    # by an approved alternative -- present even when the line is
    # otherwise feasible, so the use of an alternative is never hidden.
    alternative_coverage: list[AlternativeCoverageItem] = []
    capacity_ok: bool | None
    capacity_shortfall: CapacityShortfall | None = None
    # When the remainder (after stock) can actually be supplied -- today
    # if fully covered by stock, otherwise the capacity scan's projected
    # date. Also populated when materials are short but every remaining
    # shortfall has a reliable projected procurement date (see each
    # shortfall's `procurement`) -- None only when at least one
    # shortfall's date can't be reliably projected, or capacity itself
    # isn't evaluable.
    estimated_ready_date: date | None = None

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


class FeasibilityAdminDecision(BaseModel):
    approve: bool
    notes: str = Field(min_length=1)


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
            line.shortfalls = (
                [ShortfallItem.model_validate(item) for item in json.loads(src.shortfall_json)]
                if src.shortfall_json
                else []
            )
            line.alternative_coverage = (
                [AlternativeCoverageItem.model_validate(item) for item in json.loads(src.alternative_coverage_json)]
                if src.alternative_coverage_json
                else []
            )
            line.capacity_shortfall = (
                CapacityShortfall.model_validate(json.loads(src.capacity_shortfall_json))
                if src.capacity_shortfall_json
                else None
            )
        return data
