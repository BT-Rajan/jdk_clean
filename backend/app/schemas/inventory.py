from datetime import datetime

from pydantic import BaseModel, Field


class StockLevelOut(BaseModel):
    item_type: str
    item_id: int
    quantity_on_hand: float
    quantity_reserved: float
    quantity_available: float


class StockAdjustRequest(BaseModel):
    item_type: str = Field(pattern="^(product|raw_material)$")
    item_id: int
    quantity: float = Field(description="Positive = stock in, negative = stock out")
    movement_type: str = Field(pattern="^(receipt|issue|adjustment|return)$")
    notes: str | None = None


class LowStockItem(BaseModel):
    raw_material_id: int
    code: str
    name: str
    quantity_on_hand: float
    reorder_point: float


class FinishedGoodStockItem(BaseModel):
    product_id: int
    code: str
    name: str
    unit: str
    product_status: str
    quantity_on_hand: float
    quantity_reserved: float
    quantity_available: float
    reorder_point: float
    is_low: bool

    model_config = {"from_attributes": True}


class StockMovementOut(BaseModel):
    id: int
    item_type: str
    item_id: int
    movement_type: str
    quantity: float
    reference_type: str | None
    reference_id: int | None
    notes: str | None
    created_at: datetime
    created_by: int | None

    model_config = {"from_attributes": True}
