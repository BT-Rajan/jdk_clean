from datetime import date, datetime

from pydantic import BaseModel, Field, field_validator

from app.core.validators import not_in_past


class OrderLineIn(BaseModel):
    product_id: int
    quantity: float = Field(gt=0)
    unit_price: float = Field(ge=0)
    discount_percent: float = Field(default=0, ge=0, le=100)


class OrderLineOut(BaseModel):
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


class OrderCreate(BaseModel):
    customer_id: int
    order_date: date
    requested_delivery_date: date | None = None
    notes: str | None = None
    discount_percent: float | None = Field(default=None, ge=0, le=100)
    lines: list[OrderLineIn] = Field(min_length=1)

    @field_validator("order_date", "requested_delivery_date")
    @classmethod
    def _dates_not_past(cls, v: date | None) -> date | None:
        return not_in_past(v)

    @field_validator("lines")
    @classmethod
    def _lines_not_empty(cls, v: list[OrderLineIn]) -> list[OrderLineIn]:
        if not v:
            raise ValueError("At least one line item is required.")
        return v


class OrderUpdate(BaseModel):
    """Only draft orders may be edited (enforced in the service layer)."""

    customer_id: int | None = None
    order_date: date | None = None
    requested_delivery_date: date | None = None
    confirmed_delivery_date: date | None = None
    notes: str | None = None
    discount_percent: float | None = Field(default=None, ge=0, le=100)
    lines: list[OrderLineIn] | None = Field(default=None, min_length=1)

    @field_validator("order_date", "requested_delivery_date", "confirmed_delivery_date")
    @classmethod
    def _dates_not_past(cls, v: date | None) -> date | None:
        return not_in_past(v)


class OrderQuickLogLine(BaseModel):
    product_id: int
    quantity: float = Field(gt=0)
    unit_price: float = Field(ge=0)


class OrderQuickLog(BaseModel):
    """Log a sale that's already happened -- e.g. a walk-in/cash sale --
    in one call instead of working through draft -> confirm -> deliver
    by hand. Always fulfilled from stock on hand as of `date` (see
    order_service.log_sale), which becomes both order_date and
    delivery_date."""

    customer_id: int
    lines: list[OrderQuickLogLine] = Field(min_length=1)
    notes: str | None = None
    # Defaults to today when omitted (the Orders list's button); the
    # calendar's day-actions popup sends the clicked day instead.
    # Validated server-side against MAX_BACKDATE_DAYS -- see
    # order_service.log_sale.
    entry_date: date | None = None


class OrderStatusUpdate(BaseModel):
    status: str = Field(
        pattern="^(confirmed|in_production|ready_to_ship|shipped|delivered|cancelled)$"
    )
    # Required by the service layer when status == 'cancelled' (Sales
    # closing the order with a comment instead of a delivery note).
    reason: str | None = None


class OrderAdminReview(BaseModel):
    notes: str = Field(min_length=1)


class SplitOrderLine(BaseModel):
    order_detail_id: int
    quantity: float = Field(gt=0)


class SplitOrderRequest(BaseModel):
    lines: list[SplitOrderLine] = Field(min_length=1)


class OrderChildSummary(BaseModel):
    id: int
    order_number: str
    status: str
    total_amount: float

    model_config = {"from_attributes": True}


class OrderOut(BaseModel):
    id: int
    order_number: str
    customer_id: int
    customer_name: str | None = None
    customer_email: str | None = None
    deal_id: int | None
    deal_number: str | None = None
    order_date: date
    requested_delivery_date: date | None
    confirmed_delivery_date: date | None
    status: str
    subtotal_amount: float
    discount_percent: float
    discount_amount: float
    total_amount: float
    notes: str | None
    close_reason: str | None
    approved_at: datetime | None
    admin_review_required: bool
    admin_reviewed_at: datetime | None
    admin_review_notes: str | None
    payment_requested_at: datetime | None
    # Set when this order is itself a child born out of split_order --
    # a lighter reference back to the order it was carved from, since a
    # deliverable-now remainder came from a supply shortfall on that
    # order, not an independent request.
    parent_order_id: int | None = None
    parent_order_number: str | None = None
    # Populated the other direction on the parent: every order split off
    # of this one, so its detail page can show where its own quantity
    # actually went.
    child_orders: list[OrderChildSummary] = []
    lines: list[OrderLineOut] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @staticmethod
    def from_model(obj) -> "OrderOut":
        data = OrderOut.model_validate(obj)
        data.customer_name = obj.customer.name if obj.customer else None
        data.customer_email = obj.customer.email if obj.customer else None
        data.deal_number = obj.deal.deal_number if obj.deal else None
        data.parent_order_number = obj.parent_order.order_number if obj.parent_order else None
        data.child_orders = [
            OrderChildSummary.model_validate(child) for child in obj.child_orders if child.deleted_at is None
        ]
        for line, src in zip(data.lines, obj.lines):
            line.product_code = src.product.code if src.product else None
            line.product_name = src.product.name if src.product else None
            line.unit = src.product.unit if src.product else None
        return data
