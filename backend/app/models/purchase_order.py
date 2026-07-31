from datetime import date, datetime

from sqlalchemy import DATE, DECIMAL, Boolean, DateTime, Enum, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.mixins import SoftDeleteMixin, TimestampMixin
from app.models.raw_material import RawMaterial
from app.models.supplier import Supplier
from app.models.user import BigPK

PURCHASE_ORDER_STATUSES = (
    "draft",
    "sent",
    "confirmed",
    "partially_received",
    "received",
    "cancelled",
)

# Status transitions allowed from each current status. Mirrors the shape
# of Order's ALLOWED_TRANSITIONS (models/order.py); receiving happens via
# a dedicated action (purchase_order_service.receive_lines) rather than a
# plain status flip, since it needs per-line quantities -- reaching
# 'partially_received' or 'received' is a side effect of that action, not
# something set directly, but both are reachable from 'confirmed' since a
# single receipt can be partial or complete the whole order at once.
ALLOWED_TRANSITIONS = {
    "draft": {"sent", "cancelled"},
    "sent": {"confirmed", "cancelled"},
    "confirmed": {"partially_received", "received", "cancelled"},
    "partially_received": {"received", "cancelled"},
    "received": set(),
    "cancelled": set(),
}


class PurchaseOrder(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "purchase_orders"

    id: Mapped[int] = mapped_column(BigPK, primary_key=True)
    po_number: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)
    supplier_id: Mapped[int] = mapped_column(BigPK, ForeignKey("suppliers.id"), nullable=False)
    order_date: Mapped[date] = mapped_column(DATE, nullable=False)
    expected_delivery_date: Mapped[date | None] = mapped_column(DATE, nullable=True)
    status: Mapped[str] = mapped_column(
        Enum(*PURCHASE_ORDER_STATUSES, name="purchase_order_status"),
        nullable=False,
        default="draft",
    )
    total_amount: Mapped[float] = mapped_column(DECIMAL(14, 2), nullable=False, default=0)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    # True when the system drafted this automatically from an MRP
    # shortage, false for a person-created PO. Never auto-sent -- always
    # lands in 'draft' for procurement to review, edit, and send by hand.
    auto_created: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # Mandatory when status becomes 'cancelled' -- same requirement as
    # orders/quotations/feasibility.
    cancel_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Same admin-review escalation pattern as orders: flagged when this PO
    # is past expected_delivery_date with nothing received and not
    # cancelled -- a supplier running late, the purchasing-side mirror of
    # a customer order running overdue.
    admin_review_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    admin_reviewed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    admin_reviewed_by: Mapped[int | None] = mapped_column(BigPK, ForeignKey("users.id"), nullable=True)
    admin_review_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    supplier: Mapped[Supplier] = relationship(lazy="joined")
    lines: Mapped[list["PurchaseOrderLine"]] = relationship(
        back_populates="purchase_order",
        cascade="all, delete-orphan",
        order_by="PurchaseOrderLine.id",
    )


class PurchaseOrderLine(Base):
    __tablename__ = "purchase_order_lines"

    id: Mapped[int] = mapped_column(BigPK, primary_key=True)
    purchase_order_id: Mapped[int] = mapped_column(
        BigPK, ForeignKey("purchase_orders.id", ondelete="CASCADE"), nullable=False
    )
    raw_material_id: Mapped[int] = mapped_column(BigPK, ForeignKey("raw_materials.id"), nullable=False)
    quantity: Mapped[float] = mapped_column(DECIMAL(14, 4), nullable=False)
    unit_price: Mapped[float] = mapped_column(DECIMAL(14, 2), nullable=False)
    line_total: Mapped[float] = mapped_column(DECIMAL(14, 2), nullable=False)
    received_quantity: Mapped[float] = mapped_column(DECIMAL(14, 4), nullable=False, default=0)

    purchase_order: Mapped[PurchaseOrder] = relationship(back_populates="lines")
    raw_material: Mapped[RawMaterial] = relationship(lazy="joined")
