from datetime import date, datetime

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
    # Required by inventory_service.adjust_stock whenever item_type is
    # 'raw_material' and movement_type is 'receipt' -- a raw material
    # arriving at the factory with no supplier, cost, invoice, receiver,
    # or date attached is exactly the missing data that breaks supplier
    # and cost analytics later. batch_number/expiry_date stay optional --
    # not every raw material is batch or expiry tracked.
    supplier_id: int | None = None
    unit_cost: float | None = Field(default=None, ge=0)
    batch_number: str | None = None
    expiry_date: date | None = None
    invoice_number: str | None = None
    received_by: str | None = None
    received_date: date | None = None


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


class RawMaterialStockItem(BaseModel):
    raw_material_id: int
    code: str
    name: str
    unit: str
    material_status: str
    quantity_on_hand: float
    quantity_reserved: float
    quantity_available: float
    reorder_point: float
    is_low: bool
    # Quantity still outstanding on an open (sent/confirmed/partially
    # received) purchase order line -- always a real computed number, so
    # defaults to 0 rather than null.
    incoming_quantity: float = 0
    # From mrp_service.compute_requirements(): only set when this
    # material currently has live production demand *and* a shortfall
    # against on-hand stock -- MRP doesn't compute a "total required"
    # figure for a material with no shortfall, so left null rather than
    # invented as 0 (0 would misleadingly read as "confirmed no demand").
    required_quantity: float | None = None
    shortfall: float | None = None

    model_config = {"from_attributes": True}


class StockMovementOut(BaseModel):
    id: int
    item_type: str
    item_id: int
    item_name: str | None = None
    item_route: str | None = None
    movement_type: str
    quantity: float
    reference_type: str | None
    reference_id: int | None
    reference_label: str | None = None
    reference_route: str | None = None
    supplier_id: int | None
    unit_cost: float | None
    batch_number: str | None
    expiry_date: date | None
    invoice_number: str | None
    received_by: str | None
    received_date: date | None
    notes: str | None
    created_at: datetime
    created_by: int | None

    model_config = {"from_attributes": True}
