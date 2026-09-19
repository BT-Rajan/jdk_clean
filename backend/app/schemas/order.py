from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.validators import not_in_past


class OrderLineIn(BaseModel):
    product_id: int = Field(gt=0)
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
    model_config = ConfigDict(str_strip_whitespace=True)

    customer_id: int = Field(gt=0)
    order_date: date
    requested_delivery_date: date | None = None
    notes: str | None = Field(default=None, max_length=5000)
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

    model_config = ConfigDict(str_strip_whitespace=True)

    customer_id: int | None = Field(default=None, gt=0)
    order_date: date | None = None
    requested_delivery_date: date | None = None
    confirmed_delivery_date: date | None = None
    notes: str | None = Field(default=None, max_length=5000)
    discount_percent: float | None = Field(default=None, ge=0, le=100)
    lines: list[OrderLineIn] | None = Field(default=None, min_length=1)

    @field_validator("order_date", "requested_delivery_date", "confirmed_delivery_date")
    @classmethod
    def _dates_not_past(cls, v: date | None) -> date | None:
        return not_in_past(v)


class OrderQuickLogLine(BaseModel):
    product_id: int = Field(gt=0)
    quantity: float = Field(gt=0)
    unit_price: float = Field(ge=0)


class OrderQuickLog(BaseModel):
    """Log a sale that's already happened -- e.g. a walk-in/cash sale --
    in one call instead of working through draft -> confirm -> deliver
    by hand. Always fulfilled from stock on hand as of `date` (see
    order_service.log_sale), which becomes both order_date and
    delivery_date."""

    model_config = ConfigDict(str_strip_whitespace=True)

    customer_id: int = Field(gt=0)
    lines: list[OrderQuickLogLine] = Field(min_length=1)
    notes: str | None = Field(default=None, max_length=5000)
    # Defaults to today when omitted (the Orders list's button); the
    # calendar's day-actions popup sends the clicked day instead.
    # Validated server-side against MAX_BACKDATE_DAYS -- see
    # order_service.log_sale.
    entry_date: date | None = None


class OrderStatusUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    status: str = Field(
        pattern="^(confirmed|in_production|ready_to_ship|shipped|delivered|cancelled)$"
    )
    # Required by the service layer when status == 'cancelled' (Sales
    # closing the order with a comment instead of a delivery note).
    reason: str | None = Field(default=None, max_length=5000)


class OrderDeliveryDateChange(BaseModel):
    """Revises confirmed_delivery_date on an order that's already past
    'draft' -- see order_service.change_delivery_date. A reason is
    mandatory once a date's been committed to."""

    model_config = ConfigDict(str_strip_whitespace=True)

    confirmed_delivery_date: date
    reason: str = Field(min_length=1, max_length=5000)


class OrderBlockStatus(BaseModel):
    """Read-only answer to 'why is this order blocked' -- see
    order_service.get_order_block_status."""

    blocked: bool
    reasons: list[str]
    requires_admin_approval: bool


class OrderAdminReview(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    notes: str = Field(min_length=1, max_length=5000)


class SplitOrderLine(BaseModel):
    order_detail_id: int = Field(gt=0)
    quantity: float = Field(gt=0)


class SplitOrderRequest(BaseModel):
    lines: list[SplitOrderLine] = Field(min_length=1)


class OrderChildSummary(BaseModel):
    id: int
    order_number: str
    status: str
    total_amount: float

    model_config = {"from_attributes": True}


class CancelledProductionBatchOut(BaseModel):
    id: int
    batch_number: str
    status: str


class ReleasedReservationOut(BaseModel):
    product_id: int
    product_name: str | None
    quantity: float


class CancelledDeliveryNoteOut(BaseModel):
    id: int
    delivery_note_number: str


class OrderCancellationEffects(BaseModel):
    """What a cancellation took down with it -- see
    order_service._cancel_active_production_batches and change_status's
    'cancelled' branches. Only ever populated on the response to the
    status-change call that actually cancelled the order; None otherwise."""

    cancelled_production_batches: list[CancelledProductionBatchOut] = []
    released_reservations: list[ReleasedReservationOut] = []
    cancelled_delivery_notes: list[CancelledDeliveryNoteOut] = []


class OrderFulfillmentLineOut(BaseModel):
    """P8: per order line, how much is ordered/delivered/outstanding set
    against what's actually released FG stock right now, plus existing
    production already in the pipeline for the same product -- see
    order_service.get_fulfillment for the full reasoning."""

    order_detail_id: int
    product_id: int
    product_code: str | None
    product_name: str | None
    unit: str | None
    ordered_quantity: float
    delivered_quantity: float
    remaining_quantity: float
    available_fg: float
    fulfillable_now: float
    shortage: float
    planned_production_quantity: float
    in_progress_production_quantity: float

    model_config = {"from_attributes": True}


class OrderOut(BaseModel):
    id: int
    order_number: str
    customer_id: int
    customer_name: str | None = None
    customer_email: str | None = None
    # Added for the Order Detail page's client-info block (Client ID,
    # primary contact, mobile) so a person can see who they're dealing
    # with without leaving the order -- not a duplicate of the Client
    # Master, just a read-only projection of it (see
    # customer_service/CustomerOut for the actual source of truth).
    customer_number: str | None = None
    customer_contact_person: str | None = None
    customer_phone: str | None = None
    deal_id: int | None
    deal_number: str | None = None
    # The quotation this order was converted from, if any -- read via a
    # reverse lookup (Quotation.converted_order_id), not a column on this
    # table. None on both list rows and single-object fetches unless the
    # caller (api/orders.py) explicitly resolved and passed it in, since
    # resolving this per-row here would mean one extra query per order.
    quotation_number: str | None = None
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
    payment_link: str | None
    confirmed_at: datetime | None
    approved_at: datetime | None
    admin_review_required: bool
    admin_review_reason: str | None
    admin_reviewed_at: datetime | None
    admin_review_notes: str | None
    payment_requested_at: datetime | None
    confirmation_emailed_at: datetime | None
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
    # A single human-readable "what to do next" sentence derived from the
    # order's current status plus its real production/delivery/payment
    # state -- see order_service.get_next_action. Only populated by
    # callers that pass next_action in (the detail/status-change
    # endpoints); None on plain list rows, where computing this for every
    # row would mean several extra queries per order.
    next_action: str | None = None
    # Only set on the response to the status-change call that actually
    # cancelled this order -- see order_service.change_status and
    # OrderCancellationEffects.
    cancellation_effects: OrderCancellationEffects | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @staticmethod
    def from_model(obj, quotation_number: str | None = None, next_action: str | None = None) -> "OrderOut":
        data = OrderOut.model_validate(obj)
        data.customer_name = obj.customer.name if obj.customer else None
        data.customer_email = obj.customer.email if obj.customer else None
        data.customer_number = obj.customer.customer_number if obj.customer else None
        data.customer_contact_person = obj.customer.contact_person if obj.customer else None
        data.customer_phone = obj.customer.phone if obj.customer else None
        data.quotation_number = quotation_number
        data.deal_number = obj.deal.deal_number if obj.deal else None
        data.parent_order_number = obj.parent_order.order_number if obj.parent_order else None
        data.child_orders = [
            OrderChildSummary.model_validate(child) for child in obj.child_orders if child.deleted_at is None
        ]
        for line, src in zip(data.lines, obj.lines):
            line.product_code = src.product.code if src.product else None
            line.product_name = src.product.name if src.product else None
            line.unit = src.product.unit if src.product else None
        data.next_action = next_action
        # Transient attribute set by order_service.change_status right
        # after a cancellation -- see that function's own comment. Not a
        # mapped column, so plain getattr with a default is needed.
        effects = getattr(obj, "cancellation_effects", None)
        data.cancellation_effects = OrderCancellationEffects(**effects) if effects else None
        return data
