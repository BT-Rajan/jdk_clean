from datetime import date

from sqlalchemy import DATE, DECIMAL, Enum, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.mixins import SoftDeleteMixin, TimestampMixin
from app.models.order import Order
from app.models.product import Product
from app.models.user import BigPK

DELIVERY_NOTE_STATUSES = ("draft", "issued", "cancelled")

# Mirrors Order/PurchaseOrder's ALLOWED_TRANSITIONS shape. 'issued' is a
# terminal state on purpose: issuing drives the linked order to 'shipped'
# (see delivery_note_service.issue_delivery_note), a real inventory/order
# state change that shouldn't be reversible from here -- cancel the order
# itself if a shipment needs to be undone.
ALLOWED_TRANSITIONS = {
    "draft": {"issued", "cancelled"},
    "issued": set(),
    "cancelled": set(),
}


class DeliveryNote(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "delivery_notes"

    id: Mapped[int] = mapped_column(BigPK, primary_key=True)
    delivery_note_number: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)
    order_id: Mapped[int] = mapped_column(BigPK, ForeignKey("orders.id"), nullable=False)
    delivery_date: Mapped[date] = mapped_column(DATE, nullable=False)
    status: Mapped[str] = mapped_column(
        Enum(*DELIVERY_NOTE_STATUSES, name="delivery_note_status"),
        nullable=False,
        default="draft",
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    order: Mapped[Order] = relationship(foreign_keys=[order_id], lazy="joined")
    lines: Mapped[list["DeliveryNoteLine"]] = relationship(
        back_populates="delivery_note",
        cascade="all, delete-orphan",
        order_by="DeliveryNoteLine.id",
    )


class DeliveryNoteLine(Base):
    __tablename__ = "delivery_note_lines"

    id: Mapped[int] = mapped_column(BigPK, primary_key=True)
    delivery_note_id: Mapped[int] = mapped_column(
        BigPK, ForeignKey("delivery_notes.id", ondelete="CASCADE"), nullable=False
    )
    product_id: Mapped[int] = mapped_column(BigPK, ForeignKey("products.id"), nullable=False)
    quantity_delivered: Mapped[float] = mapped_column(DECIMAL(14, 4), nullable=False)

    delivery_note: Mapped[DeliveryNote] = relationship(back_populates="lines")
    product: Mapped[Product] = relationship(lazy="joined")
