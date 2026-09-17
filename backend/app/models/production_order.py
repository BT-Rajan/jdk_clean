from datetime import date

from sqlalchemy import DATE, DECIMAL, Enum, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.mixins import TimestampMixin
from app.models.order import Order, OrderDetail
from app.models.product import Product
from app.models.user import BigPK

PRODUCTION_ORDER_STATUSES = ("planned", "cancelled")

# Deliberately minimal for P2 -- see docs/production-lifecycle.md. A
# Production Order is the WHAT-to-produce record; material allocation,
# scheduling, execution, and QC/completion statuses belong to the
# ProductionSchedule/execution layer built in later passes, not here.
# 'cancelled' is terminal, same shape as every other cancel-only-from-open
# module (ALLOWED_TRANSITIONS lives on the model, checked the same way as
# Order/Quotation/ProductionSchedule via core/workflow.assert_transition_allowed).
ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    "planned": {"cancelled"},
    "cancelled": set(),
}

# A customer order can only receive a new Production Order while it's
# still open and committed to being produced -- mirrors the same
# reasoning as ProductionSchedule's own order linkage, but checked
# up front at creation instead of implicitly. 'ready_to_ship' and beyond
# mean the order's demand is already fully covered (by stock or existing
# production), so there is nothing left to plan production for. Only
# consulted when a Production Order is being created *against* an order
# line at all -- see order_detail_id's own comment below for the
# (equally legitimate) case where it isn't.
ELIGIBLE_ORDER_STATUSES = ("confirmed", "in_production")

PRIORITIES = ("low", "normal", "high", "urgent")


class ProductionOrder(Base, TimestampMixin):
    """The internal manufacturing instruction: WHAT product, HOW MUCH, and
    BY WHEN -- see docs/production-lifecycle.md for the full WHAT/WHEN/
    WHAT-happened boundary this deliberately stops short of. Scheduling
    (machine/dates) and execution (actual output) are ProductionSchedule's
    job, not this table's -- a Production Order does not create or touch
    a ProductionSchedule in this pass.

    P8 (finished-goods inventory & order fulfilment) corrected an
    architecture flaw from this table's original P2 design: order_id/
    order_detail_id here are now optional, not mandatory. JDK actually
    runs on a stock-driven model -- production happens continuously
    against expected demand, output becomes ordinary Finished Goods
    inventory once QC releases it (see qc_service.py), and a Customer
    Order simply consumes whatever released FG stock is available
    (order_service.get_fulfillment) rather than owning a dedicated
    Production Order of its own. A Production Order MAY still name the
    order line that prompted it (order_detail_id set) purely for demand-
    tracking convenience -- "how much of this line has been committed to
    production" (get_remaining_quantity) still sums sibling Production
    Orders for that line the same way it always has -- but that link is
    informational, never a claim on the resulting stock: any released FG
    unit fulfils any order regardless of which Production Order (if any)
    produced it. order_id is simply order_detail's own parent order,
    kept alongside it as the same direct-storage convenience every other
    FK-mirroring column in this chain already uses -- see product_id's
    own comment below.
    """

    __tablename__ = "production_orders"

    id: Mapped[int] = mapped_column(BigPK, primary_key=True)
    production_order_number: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)
    order_id: Mapped[int | None] = mapped_column(BigPK, ForeignKey("orders.id"), nullable=True)
    # NULL means this Production Order exists to build (or replenish)
    # general Finished Goods stock, not to satisfy one specific order
    # line -- see this model's own docstring. When set, always the same
    # order_detail whose product_id matches this row's own product_id.
    order_detail_id: Mapped[int | None] = mapped_column(BigPK, ForeignKey("order_details.id"), nullable=True)
    # Set explicitly at creation either way: mirrors order_details.
    # product_id when order_detail_id is given (same direct-storage
    # convention ProductionSchedule.product_id already uses, so this
    # table can be filtered/joined by product without also joining
    # through order_details every time), or supplied directly by the
    # caller for a stock-only Production Order.
    product_id: Mapped[int] = mapped_column(BigPK, ForeignKey("products.id"), nullable=False)
    planned_quantity: Mapped[float] = mapped_column(DECIMAL(14, 4), nullable=False)
    due_date: Mapped[date] = mapped_column(DATE, nullable=False)
    priority: Mapped[str] = mapped_column(
        Enum(*PRIORITIES, name="production_order_priority"), nullable=False, default="normal"
    )
    status: Mapped[str] = mapped_column(
        Enum(*PRODUCTION_ORDER_STATUSES, name="production_order_status"),
        nullable=False,
        default="planned",
    )
    # Mandatory when status becomes 'cancelled' -- same convention as
    # every other cancellable module in this app.
    cancel_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    order: Mapped[Order | None] = relationship(foreign_keys=[order_id], lazy="joined")
    order_detail: Mapped[OrderDetail | None] = relationship(foreign_keys=[order_detail_id], lazy="joined")
    product: Mapped[Product] = relationship(foreign_keys=[product_id], lazy="joined")
