from datetime import date, datetime

from sqlalchemy import DATE, DECIMAL, Boolean, DateTime, Enum, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.machine import Machine
from app.models.mixins import SoftDeleteMixin, TimestampMixin
from app.models.order import Order
from app.models.product import Product
from app.models.user import BigPK

PRODUCTION_STATUSES = ("planned", "in_progress", "completed", "cancelled")

# Status transitions allowed from each current status. Mirrors the exact
# shape of Order/Quotation's ALLOWED_TRANSITIONS (see models/order.py) so
# the service-layer check is identical in style.
ALLOWED_TRANSITIONS = {
    "planned": {"in_progress", "cancelled"},
    "in_progress": {"completed", "cancelled"},
    "completed": set(),
    "cancelled": set(),
}


class ProductionSchedule(Base, TimestampMixin, SoftDeleteMixin):
    """One production batch: a planned (and later actual) run of a product,
    optionally tied to a specific order. Table already existed in
    schema.sql -- see 2026-07-28-era comments there -- but had no model,
    service, or API until this feature.
    """

    __tablename__ = "production_schedules"

    id: Mapped[int] = mapped_column(BigPK, primary_key=True)
    batch_number: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)
    product_id: Mapped[int] = mapped_column(BigPK, ForeignKey("products.id"), nullable=False)
    # Which machine this batch occupies. Defaults to the product's own
    # machine_id at creation time (see production_service.create_batch) but
    # stored explicitly since a batch could in principle run on a
    # different machine than the product's usual one.
    machine_id: Mapped[int | None] = mapped_column(BigPK, ForeignKey("machines.id"), nullable=True)
    order_id: Mapped[int | None] = mapped_column(BigPK, ForeignKey("orders.id"), nullable=True)
    planned_quantity: Mapped[float] = mapped_column(DECIMAL(14, 4), nullable=False)
    produced_quantity: Mapped[float] = mapped_column(DECIMAL(14, 4), nullable=False, default=0)
    scheduled_start: Mapped[date] = mapped_column(DATE, nullable=False)
    scheduled_end: Mapped[date] = mapped_column(DATE, nullable=False)
    actual_start: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    actual_end: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    status: Mapped[str] = mapped_column(
        Enum(*PRODUCTION_STATUSES, name="production_schedule_status"),
        nullable=False,
        default="planned",
    )
    # True when the system created this batch automatically on order
    # confirmation (see order_service.py), false for a person-created batch.
    auto_scheduled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # Mandatory when status becomes 'cancelled' -- same requirement as
    # orders/quotations/feasibility.
    cancel_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    product: Mapped[Product] = relationship(foreign_keys=[product_id], lazy="joined")
    machine: Mapped[Machine | None] = relationship(foreign_keys=[machine_id], lazy="joined")
    order: Mapped[Order | None] = relationship(foreign_keys=[order_id], lazy="joined")
