from datetime import date, datetime

from pydantic import BaseModel, Field, field_validator

from app.core.validators import not_in_past


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
    # Percentage, e.g. 0 or 5. Defaults to Settings -> default_tax_rate
    # (0% -- Kuwait has no GST/VAT) when not given.
    tax_rate: float | None = Field(default=None, ge=0, le=100)
    lines: list[PurchaseOrderLineIn] = Field(min_length=1)

    @field_validator("order_date", "expected_delivery_date")
    @classmethod
    def _dates_not_past(cls, v: date | None) -> date | None:
        return not_in_past(v)


class PurchaseOrderUpdate(BaseModel):
    """Only 'draft' purchase orders may be edited (enforced in the service
    layer), mirroring how Order/Quotation restrict edits after certain
    statuses."""

    supplier_id: int | None = None
    order_date: date | None = None
    expected_delivery_date: date | None = None
    notes: str | None = None
    tax_rate: float | None = Field(default=None, ge=0, le=100)
    lines: list[PurchaseOrderLineIn] | None = None

    @field_validator("order_date", "expected_delivery_date")
    @classmethod
    def _dates_not_past(cls, v: date | None) -> date | None:
        return not_in_past(v)


class PurchaseOrderStatusUpdate(BaseModel):
    status: str = Field(pattern="^(sent|confirmed|cancelled)$")
    # Required when status == 'cancelled' (enforced in the service layer).
    reason: str | None = None


class PurchaseOrderAdminReview(BaseModel):
    notes: str = Field(min_length=1)


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
    supplier_email: str | None = None
    order_date: date
    expected_delivery_date: date | None
    status: str
    subtotal_amount: float
    tax_rate: float
    tax_amount: float
    total_amount: float
    notes: str | None
    auto_created: bool
    cancel_reason: str | None
    approved_at: datetime | None
    admin_review_required: bool
    admin_reviewed_at: datetime | None
    admin_review_notes: str | None
    lines: list[PurchaseOrderLineOut]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @staticmethod
    def from_model(obj) -> "PurchaseOrderOut":
        data = PurchaseOrderOut.model_validate(obj)
        data.supplier_code = obj.supplier.code if obj.supplier else None
        data.supplier_name = obj.supplier.name if obj.supplier else None
        data.supplier_email = obj.supplier.email if obj.supplier else None
        for line_out, line_obj in zip(data.lines, obj.lines, strict=True):
            line_out.material_code = line_obj.raw_material.code if line_obj.raw_material else None
            line_out.material_name = line_obj.raw_material.name if line_obj.raw_material else None
            line_out.unit = line_obj.raw_material.unit if line_obj.raw_material else None
        return data
