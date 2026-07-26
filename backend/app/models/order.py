from datetime import date

from sqlalchemy import DATE, DECIMAL, Enum, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.customer import Customer
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
    "confirmed": {"in_production", "cancelled"},
    "in_production": {"ready_to_ship", "cancelled"},
    "ready_to_ship": {"shipped", "cancelled"},
    "shipped": {"delivered"},
    "delivered": set(),
    "cancelled": set(),
}

# Statuses at/after which finished-goods stock has been reserved for this
# order (used to decide whether cancelling needs to release a reservation).
RESERVED_STATUSES = {"confirmed", "in_production", "ready_to_ship"}


class Order(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(BigPK, primary_key=True)
    order_number: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)
    customer_id: Mapped[int] = mapped_column(BigPK, ForeignKey("customers.id"), nullable=False)
    order_date: Mapped[date] = mapped_column(DATE, nullable=False)
    requested_delivery_date: Mapped[date | None] = mapped_column(DATE, nullable=True)
    confirmed_delivery_date: Mapped[date | None] = mapped_column(DATE, nullable=True)
    status: Mapped[str] = mapped_column(
        Enum(*ORDER_STATUSES, name="order_status"), nullable=False, default="draft"
    )
    total_amount: Mapped[float] = mapped_column(DECIMAL(14, 2), nullable=False, default=0)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    customer: Mapped[Customer] = relationship(lazy="joined")
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
    line_total: Mapped[float] = mapped_column(DECIMAL(14, 2), nullable=False)

    order: Mapped[Order] = relationship(back_populates="lines")
    product: Mapped[Product] = relationship(lazy="joined")
