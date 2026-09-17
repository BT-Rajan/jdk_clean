from datetime import date, datetime

from pydantic import BaseModel, Field, field_validator

from app.core.validators import not_in_past


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
    # P9 section 18: this line's own product's order-wide fulfilment
    # context, as of right now -- reuses order_service.get_fulfillment
    # (the same figures the Customer Order detail page shows) rather
    # than a second calculation. delivered_quantity/remaining_quantity
    # are order-wide totals (every issued note for this order, this one
    # included once it's issued), not just this one note's own
    # quantity_delivered above. None when not populated by the endpoint
    # (see DeliveryNoteOut.from_model).
    ordered_quantity: float | None = None
    delivered_quantity: float | None = None
    remaining_quantity: float | None = None
    available_fg: float | None = None
    fulfillable_now: float | None = None

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

    @field_validator("delivery_date")
    @classmethod
    def _delivery_date_not_past(cls, v: date) -> date:
        return not_in_past(v)


class DeliveryNoteUpdate(BaseModel):
    """Only 'draft' notes may be edited (enforced in the service layer)."""

    delivery_date: date | None = None
    notes: str | None = None
    lines: list[DeliveryNoteLineIn] | None = None

    @field_validator("delivery_date")
    @classmethod
    def _delivery_date_not_past(cls, v: date | None) -> date | None:
        return not_in_past(v)


class DeliveryNoteStatusUpdate(BaseModel):
    status: str = Field(pattern="^(issued|cancelled)$")
    # Required when status == 'cancelled' (enforced in the service layer).
    reason: str | None = None


class DeliveryNoteOut(BaseModel):
    id: int
    delivery_note_number: str
    order_id: int
    order_number: str | None = None
    customer_name: str | None = None
    customer_email: str | None = None
    delivery_date: date
    status: str
    auto_created: bool
    cancel_reason: str | None
    notes: str | None
    lines: list[DeliveryNoteLineOut]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @staticmethod
    def from_model(obj, fulfillment_by_product: dict[int, dict] | None = None) -> "DeliveryNoteOut":
        """fulfillment_by_product: {product_id: order_service.get_fulfillment
        line dict} -- populated by the endpoint (needs its own query, same
        "populated by the endpoint, not from_model" pattern
        ProductionExecutionOut.fg_release_status already uses), not
        computed here. None (the default) leaves every line's fulfilment
        field at None -- used by list endpoints that don't need the
        per-line detail."""
        data = DeliveryNoteOut.model_validate(obj)
        data.order_number = obj.order.order_number if obj.order else None
        data.customer_name = obj.order.customer.name if obj.order and obj.order.customer else None
        data.customer_email = obj.order.customer.email if obj.order and obj.order.customer else None
        for line_out, line_obj in zip(data.lines, obj.lines, strict=True):
            line_out.product_code = line_obj.product.code if line_obj.product else None
            line_out.product_name = line_obj.product.name if line_obj.product else None
            line_out.unit = line_obj.product.unit if line_obj.product else None
            fulfillment = (fulfillment_by_product or {}).get(line_obj.product_id)
            if fulfillment is not None:
                line_out.ordered_quantity = fulfillment["ordered_quantity"]
                line_out.delivered_quantity = fulfillment["delivered_quantity"]
                line_out.remaining_quantity = fulfillment["remaining_quantity"]
                line_out.available_fg = fulfillment["available_fg"]
                line_out.fulfillable_now = fulfillment["fulfillable_now"]
        return data
