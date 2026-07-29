from datetime import date, datetime

from pydantic import BaseModel, Field


class DeliveryNoteLineIn(BaseModel):
    product_id: int
    quantity_delivered: float = Field(gt=0)


class DeliveryNoteLineOut(BaseModel):
    id: int
    product_id: int
    product_code: str | None = None
    product_name: str | None = None
    unit: str | None = None
    quantity_delivered: float

    model_config = {"from_attributes": True}


class DeliveryNoteCreate(BaseModel):
    order_id: int
    delivery_date: date
    notes: str | None = None
    # If omitted, lines are auto-populated from the order's own lines
    # (see delivery_note_service.create_delivery_note) -- pass this only
    # to override the delivered quantities at creation time instead of
    # editing them afterward while still draft.
    lines: list[DeliveryNoteLineIn] | None = None


class DeliveryNoteUpdate(BaseModel):
    """Only 'draft' notes may be edited (enforced in the service layer)."""

    delivery_date: date | None = None
    notes: str | None = None
    lines: list[DeliveryNoteLineIn] | None = None


class DeliveryNoteStatusUpdate(BaseModel):
    status: str = Field(pattern="^(issued|cancelled)$")


class DeliveryNoteOut(BaseModel):
    id: int
    delivery_note_number: str
    order_id: int
    order_number: str | None = None
    customer_name: str | None = None
    delivery_date: date
    status: str
    notes: str | None
    lines: list[DeliveryNoteLineOut]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @staticmethod
    def from_model(obj) -> "DeliveryNoteOut":
        data = DeliveryNoteOut.model_validate(obj)
        data.order_number = obj.order.order_number if obj.order else None
        data.customer_name = obj.order.customer.name if obj.order and obj.order.customer else None
        for line_out, line_obj in zip(data.lines, obj.lines, strict=True):
            line_out.product_code = line_obj.product.code if line_obj.product else None
            line_out.product_name = line_obj.product.name if line_obj.product else None
            line_out.unit = line_obj.product.unit if line_obj.product else None
        return data
