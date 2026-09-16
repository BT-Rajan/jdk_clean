from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.production_order import PRIORITIES


class ProductionOrderCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    order_id: int = Field(gt=0)
    order_detail_id: int = Field(gt=0)
    planned_quantity: float = Field(gt=0)
    due_date: date
    priority: str = Field(default="normal", pattern=f"^({'|'.join(PRIORITIES)})$")
    notes: str | None = Field(default=None, max_length=5000)


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
    order_id: int
    order_number: str | None = None
    customer_id: int | None = None
    customer_name: str | None = None
    order_detail_id: int
    product_id: int
    product_code: str | None = None
    product_name: str | None = None
    unit: str | None = None
    ordered_quantity: float | None = None
    planned_quantity: float
    # "How much of this order line has yet to be committed to ANY
    # Production Order" -- computed server-side (sums sibling, non-
    # cancelled Production Orders for the same order_detail_id), not
    # stored. Populated by the list/get endpoints, not from_model, since
    # it needs a database query -- see production_orders.py's
    # _with_remaining, mirroring production_schedules.py's own
    # _with_readiness pattern.
    remaining_order_quantity: float | None = None
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
        return data
