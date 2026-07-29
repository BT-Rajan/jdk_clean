from datetime import datetime

from pydantic import BaseModel


class MrpSuggestedPurchase(BaseModel):
    supplier_id: int
    supplier_code: str
    supplier_name: str
    quantity: float
    lead_time_days: int | None
    mode_of_supply: str | None


class MrpRequirementLine(BaseModel):
    raw_material_id: int
    code: str
    name: str
    unit: str
    reorder_point: float
    total_required: float
    current_on_hand: float
    shortfall: float
    uncovered_quantity: float
    fully_covered: bool
    suggested_purchases: list[MrpSuggestedPurchase]


class MrpReport(BaseModel):
    generated_at: datetime
    items: list[MrpRequirementLine]
