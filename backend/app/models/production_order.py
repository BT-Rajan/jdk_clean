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
# production), so there is nothing left to plan production for.
ELIGIBLE_ORDER_STATUSES = ("confirmed", "in_production")

PRIORITIES = ("low", "normal", "high", "urgent")


class ProductionOrder(Base, TimestampMixin):
    """The internal manufacturing instruction for a slice of a confirmed
    customer order line: WHAT product, HOW MUCH, and BY WHEN -- see
    docs/production-lifecycle.md for the full WHAT/WHEN/WHAT-happened
    boundary this deliberately stops short of. Scheduling (machine/dates)
    and execution (actual output) are ProductionSchedule's job, not this
    table's -- a Production Order does not create or touch a
    ProductionSchedule in this pass.

    Always traceable to exactly one order line (order_detail_id), so
    "how much of this line has been committed to production" can be
    computed by summing sibling Production Orders for that line rather
    than needing a separate running total column here.
    """

    __tablename__ = "production_orders"

    id: Mapped[int] = mapped_column(BigPK, primary_key=True)
    production_order_number: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)
    order_id: Mapped[int] = mapped_column(BigPK, ForeignKey("orders.id"), nullable=False)
    order_detail_id: Mapped[int] = mapped_column(BigPK, ForeignKey("order_details.id"), nullable=False)
    # Mirrors order_details.product_id at creation time -- same direct-
    # storage convention ProductionSchedule.product_id already uses --
    # so this table can be filtered/joined by product without also
    # joining through order_details every time.
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

    order: Mapped[Order] = relationship(foreign_keys=[order_id], lazy="joined")
    order_detail: Mapped[OrderDetail] = relationship(foreign_keys=[order_detail_id], lazy="joined")
    product: Mapped[Product] = relationship(foreign_keys=[product_id], lazy="joined")
