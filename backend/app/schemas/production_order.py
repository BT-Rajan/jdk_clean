from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.production_order import PRIORITIES


class ProductionOrderCreate(BaseModel):
    """Two mutually exclusive ways to raise a Production Order (P8 --
    see models/production_order.py's own docstring on why order linkage
    is no longer mandatory): order_detail_id for one raised against a
    specific, still-open customer order line (order_id is derived from
    it server-side, never taken from the client), or product_id for a
    stock-only order building/replenishing general Finished Goods
    inventory with no customer order behind it at all. Exactly one of
    the two must be given."""

    model_config = ConfigDict(str_strip_whitespace=True)

    order_detail_id: int | None = Field(default=None, gt=0)
    product_id: int | None = Field(default=None, gt=0)
    planned_quantity: float = Field(gt=0)
    due_date: date
    priority: str = Field(default="normal", pattern=f"^({'|'.join(PRIORITIES)})$")
    notes: str | None = Field(default=None, max_length=5000)

    @model_validator(mode="after")
    def _exactly_one_target(self) -> "ProductionOrderCreate":
        if bool(self.order_detail_id) == bool(self.product_id):
            raise ValueError("Give exactly one of order_detail_id (order-linked) or product_id (stock-only).")
        return self


class ProductionOrderStatusUpdate(BaseModel):
    """'cancelled' is the only settable target in this pass -- 'planned'
    is the creation default and never set directly, same exclusion
    pattern every other status-update schema in this app uses."""

    model_config = ConfigDict(str_strip_whitespace=True)

    status: str = Field(pattern="^cancelled$")
    # Required when cancelling -- enforced in the service layer, same
    # convention as orders/quotations/production schedules.
    reason: str | None = Field(default=None, max_length=5000)


class ProductionOrderOut(BaseModel):
    id: int
    production_order_number: str
    # NULL/None together on both means a stock-only Production Order --
    # see models/production_order.py's own docstring.
    order_id: int | None
    order_number: str | None = None
    customer_id: int | None = None
    customer_name: str | None = None
    order_detail_id: int | None
    # The source sales-order line's own unit price -- alongside
    # ordered_quantity, the rest of what identifies *which* line on the
    # order this Production Order was raised against, distinct from the
    # order/product identifiers already shown. None for a stock-only
    # order -- there's no order line at all.
    order_line_unit_price: float | None = None
    product_id: int
    product_code: str | None = None
    product_name: str | None = None
    unit: str | None = None
    ordered_quantity: float | None = None
    planned_quantity: float
    # 'make_to_order' when order_detail_id is set (raised against a
    # specific, still-open customer order line), 'make_to_stock'
    # otherwise (building/replenishing general Finished Goods inventory
    # with no customer order behind it) -- see models/production_order.py's
    # own docstring on this same order_id/order_detail_id-optional split.
    # Purely derived from that split, never a separately stored choice.
    production_type: str = "make_to_stock"
    # "How much of this order line has yet to be committed to ANY
    # Production Order" -- computed server-side (sums sibling, non-
    # cancelled Production Orders for the same order_detail_id), not
    # stored. Populated by the list/get endpoints, not from_model, since
    # it needs a database query -- see production_orders.py's
    # _with_remaining, mirroring production_schedules.py's own
    # _with_readiness pattern. Always None for a stock-only order --
    # there's no order line to compute it against.
    remaining_order_quantity: float | None = None
    # required/scheduled/produced/remaining, all populated the same way
    # as remaining_order_quantity above (by the endpoint, not from_model)
    # -- required_quantity mirrors planned_quantity for symmetry with the
    # other three, scheduled_quantity/produced_quantity sum this order's
    # own non-cancelled schedules/completed executions (production_order_
    # schedule_service.get_scheduled_quantity / production_execution_
    # service.get_produced_quantity), and remaining_quantity/
    # unscheduled_quantity are what's left of planned_quantity against
    # each of those. Never stored -- always derived fresh, same "no
    # manually maintained running total" stance get_progress already
    # documents.
    required_quantity: float | None = None
    scheduled_quantity: float | None = None
    produced_quantity: float | None = None
    remaining_quantity: float | None = None
    unscheduled_quantity: float | None = None
    due_date: date
    priority: str
    status: str
    cancel_reason: str | None
    notes: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @staticmethod
    def from_model(obj) -> "ProductionOrderOut":
        data = ProductionOrderOut.model_validate(obj)
        data.order_number = obj.order.order_number if obj.order else None
        data.customer_id = obj.order.customer_id if obj.order else None
        data.customer_name = obj.order.customer.name if obj.order and obj.order.customer else None
        data.product_code = obj.product.code if obj.product else None
        data.product_name = obj.product.name if obj.product else None
        data.unit = obj.product.unit if obj.product else None
        data.ordered_quantity = float(obj.order_detail.quantity) if obj.order_detail else None
        data.order_line_unit_price = float(obj.order_detail.unit_price) if obj.order_detail else None
        data.production_type = "make_to_order" if obj.order_detail_id is not None else "make_to_stock"
        data.required_quantity = float(obj.planned_quantity)
        return data
