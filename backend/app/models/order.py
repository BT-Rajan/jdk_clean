from datetime import date, datetime

from sqlalchemy import DATE, DECIMAL, Boolean, DateTime, Enum, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.customer import Customer
from app.models.deal import Deal
from app.models.mixins import SoftDeleteMixin, TimestampMixin
from app.models.product import Product
from app.models.user import BigPK

ORDER_STATUSES = (
    "draft",
    "confirmed",
    "in_production",
    "ready_to_ship",
    "shipped",
    "delivered",
    "cancelled",
)

# Status transitions allowed from each current status.
ALLOWED_TRANSITIONS = {
    "draft": {"confirmed", "cancelled"},
    # 'ready_to_ship' is reachable directly from 'confirmed' -- not just
    # via 'in_production' -- for the case where every line is already
    # covered by existing finished-goods stock and nothing actually needs
    # producing (see order_service._maybe_auto_schedule_production). A
    # person can still choose it directly for the same reason (e.g.
    # fulfilling entirely from stock without the automation ever running).
    "confirmed": {"in_production", "ready_to_ship", "cancelled"},
    "in_production": {"ready_to_ship", "cancelled"},
    "ready_to_ship": {"shipped", "cancelled"},
    # Cancelling from 'shipped'/'delivered' is a genuine after-the-fact
    # cancellation (customer refused/returned the goods after they left the
    # building) -- unlike DeliveryNote's 'issued', which stays terminal.
    # order_service.change_status reverses the actual delivered quantities
    # back into stock (movement_type='return') rather than just flipping
    # the status, so physical reality and the ledger stay in sync.
    "shipped": {"delivered", "cancelled"},
    "delivered": {"cancelled"},
    "cancelled": set(),
}

# Statuses at/after which finished-goods stock has been reserved for this
# order (used to decide whether cancelling needs to release a reservation).
RESERVED_STATUSES = {"confirmed", "in_production", "ready_to_ship"}

# Cancelling without a delivery note is Sales closing the order with a
# comment instead of fulfilling it -- a reason is mandatory (see
# order_service.change_status).
STATUSES_REQUIRING_CLOSE_REASON = {"cancelled"}

# Orders in these statuses are still "open" (not yet fulfilled or closed)
# for the purposes of the overdue-delivery admin escalation.
OPEN_STATUSES = {"draft", "confirmed", "in_production", "ready_to_ship"}


class Order(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(BigPK, primary_key=True)
    order_number: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)
    customer_id: Mapped[int] = mapped_column(BigPK, ForeignKey("customers.id"), nullable=False)
    # The deal this order belongs to (see models/deal.py) -- inherited
    # from its quotation if it has one, otherwise newly minted.
    deal_id: Mapped[int | None] = mapped_column(BigPK, ForeignKey("deals.id"), nullable=True)
    order_date: Mapped[date] = mapped_column(DATE, nullable=False)
    requested_delivery_date: Mapped[date | None] = mapped_column(DATE, nullable=True)
    confirmed_delivery_date: Mapped[date | None] = mapped_column(DATE, nullable=True)
    status: Mapped[str] = mapped_column(
        Enum(*ORDER_STATUSES, name="order_status"), nullable=False, default="draft"
    )
    subtotal_amount: Mapped[float] = mapped_column(DECIMAL(14, 2), nullable=False, default=0)
    discount_percent: Mapped[float] = mapped_column(DECIMAL(5, 2), nullable=False, default=0)
    discount_amount: Mapped[float] = mapped_column(DECIMAL(14, 2), nullable=False, default=0)
    total_amount: Mapped[float] = mapped_column(DECIMAL(14, 2), nullable=False, default=0)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Set when Sales cancels this order without a delivery note ever
    # having been issued for it.
    close_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    # An order whose discount (document-level or any single line's) is
    # at/above Settings -> large_discount_approval_threshold can't leave
    # 'draft' until an admin approves it.
    approved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    approved_by: Mapped[int | None] = mapped_column(BigPK, ForeignKey("users.id"), nullable=True)
    # Set by order_service.escalate_overdue_orders when the (confirmed or
    # requested) delivery date has passed with neither a delivery note nor
    # close_reason recorded. Cleared by an admin via admin_review().
    admin_review_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    admin_reviewed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    admin_reviewed_by: Mapped[int | None] = mapped_column(BigPK, ForeignKey("users.id"), nullable=True)
    admin_review_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Set the last time a payment-request email went out for this order
    # (see payment_service.py) -- purely informational, for Sales to see
    # "sent N days ago, still nothing recorded" at a glance.
    payment_requested_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # Set when this order was itself born out of order_service.split_order
    # -- carving a deliverable-now quantity off a 'ready_to_ship' order
    # that stock can't fully cover yet (see that function's docstring).
    # The child is a completely normal order from here on: its own
    # number, its own delivery note, its own status progression. Self-FK
    # rather than a separate table since a child is in every other
    # respect just an order.
    parent_order_id: Mapped[int | None] = mapped_column(BigPK, ForeignKey("orders.id"), nullable=True)

    customer: Mapped[Customer] = relationship(lazy="joined")
    deal: Mapped[Deal | None] = relationship(lazy="joined")
    parent_order: Mapped["Order | None"] = relationship(
        "Order", remote_side=[id], back_populates="child_orders", lazy="joined"
    )
    child_orders: Mapped[list["Order"]] = relationship("Order", back_populates="parent_order")
    lines: Mapped[list["OrderDetail"]] = relationship(
        back_populates="order",
        cascade="all, delete-orphan",
        order_by="OrderDetail.id",
    )


class OrderDetail(Base):
    __tablename__ = "order_details"

    id: Mapped[int] = mapped_column(BigPK, primary_key=True)
    order_id: Mapped[int] = mapped_column(
        BigPK, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False
    )
    product_id: Mapped[int] = mapped_column(BigPK, ForeignKey("products.id"), nullable=False)
    quantity: Mapped[float] = mapped_column(DECIMAL(14, 4), nullable=False)
    unit_price: Mapped[float] = mapped_column(DECIMAL(14, 2), nullable=False)
    discount_percent: Mapped[float] = mapped_column(DECIMAL(5, 2), nullable=False, default=0)
    line_total: Mapped[float] = mapped_column(DECIMAL(14, 2), nullable=False)

    order: Mapped[Order] = relationship(back_populates="lines")
    product: Mapped[Product] = relationship(lazy="joined")
