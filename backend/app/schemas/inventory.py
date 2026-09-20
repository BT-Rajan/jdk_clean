from datetime import date, datetime

from pydantic import BaseModel, Field


class StockLevelOut(BaseModel):
    item_type: str
    item_id: int
    quantity_on_hand: float
    quantity_reserved: float
    quantity_available: float
    # Set only when this StockLevelOut was returned by a call that just
    # created a movement (adjust_stock) -- the ledger entry this exact
    # adjustment is traceable to. None from a plain GET /stock/{type}/{id}.
    movement_id: int | None = None


class StockAdjustRequest(BaseModel):
    item_type: str = Field(pattern="^(product|raw_material)$")
    item_id: int
    quantity: float = Field(description="Positive = stock in, negative = stock out")
    movement_type: str = Field(pattern="^(receipt|issue|adjustment|return)$")
    # Mandatory for every manual adjustment -- see
    # inventory_service.submit_manual_adjustment.
    notes: str = Field(min_length=1, max_length=255)
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
    # 'raw_material' | 'packaging' | 'consumable' -- see
    # RawMaterial.material_type. Lets the raw-materials stock view be
    # filtered to just packaging (or just consumables), shown
    # independently from ordinary raw material stock.
    material_type: str
    material_status: str
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


class StockAdjustmentRequestOut(BaseModel):
    id: int
    item_type: str
    item_id: int
    quantity: float
    movement_type: str
    reason: str
    supplier_id: int | None
    unit_cost: float | None
    batch_number: str | None
    expiry_date: date | None
    invoice_number: str | None
    received_by: str | None
    received_date: date | None
    status: str
    rejection_reason: str | None
    resulting_movement_id: int | None
    requested_by: int | None
    requested_at: datetime
    decided_by: int | None
    decided_at: datetime | None

    model_config = {"from_attributes": True}


class StockAdjustmentResultOut(BaseModel):
    # 'applied' | 'pending_approval' -- see
    # inventory_service.submit_manual_adjustment.
    status: str
    stock: StockLevelOut | None
    request: StockAdjustmentRequestOut | None


class StockAdjustmentRejectRequest(BaseModel):
    reason: str = Field(min_length=1, max_length=5000)
