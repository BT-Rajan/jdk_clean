from datetime import date, datetime

from pydantic import BaseModel, Field


class PurchaseOrderLineIn(BaseModel):
    raw_material_id: int
    quantity: float = Field(gt=0)
    unit_price: float = Field(ge=0)


class PurchaseOrderLineOut(BaseModel):
    id: int
    raw_material_id: int
    material_code: str | None = None
    material_name: str | None = None
    unit: str | None = None
    quantity: float
    unit_price: float
    line_total: float
    received_quantity: float

    model_config = {"from_attributes": True}


class PurchaseOrderCreate(BaseModel):
    supplier_id: int
    order_date: date
    expected_delivery_date: date | None = None
    notes: str | None = None
    lines: list[PurchaseOrderLineIn] = Field(min_length=1)


class PurchaseOrderUpdate(BaseModel):
    """Only 'draft' purchase orders may be edited (enforced in the service
    layer), mirroring how Order/Quotation restrict edits after certain
    statuses."""

    supplier_id: int | None = None
    order_date: date | None = None
    expected_delivery_date: date | None = None
    notes: str | None = None
    lines: list[PurchaseOrderLineIn] | None = None


class PurchaseOrderStatusUpdate(BaseModel):
    status: str = Field(pattern="^(sent|confirmed|cancelled)$")


class ReceiveLine(BaseModel):
    line_id: int
    quantity: float = Field(gt=0)


class ReceivePurchaseOrder(BaseModel):
    lines: list[ReceiveLine] = Field(min_length=1)


class PurchaseOrderOut(BaseModel):
    id: int
    po_number: str
    supplier_id: int
    supplier_code: str | None = None
    supplier_name: str | None = None
    order_date: date
    expected_delivery_date: date | None
    status: str
    total_amount: float
    notes: str | None
    lines: list[PurchaseOrderLineOut]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @staticmethod
    def from_model(obj) -> "PurchaseOrderOut":
        data = PurchaseOrderOut.model_validate(obj)
        data.supplier_code = obj.supplier.code if obj.supplier else None
        data.supplier_name = obj.supplier.name if obj.supplier else None
        for line_out, line_obj in zip(data.lines, obj.lines, strict=True):
            line_out.material_code = line_obj.raw_material.code if line_obj.raw_material else None
            line_out.material_name = line_obj.raw_material.name if line_obj.raw_material else None
            line_out.unit = line_obj.raw_material.unit if line_obj.raw_material else None
        return data
