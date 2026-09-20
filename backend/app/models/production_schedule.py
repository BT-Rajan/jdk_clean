from datetime import date, datetime

from sqlalchemy import DATE, DECIMAL, Boolean, DateTime, Enum, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.machine import Machine
from app.models.mixins import SoftDeleteMixin, TimestampMixin
from app.models.order import Order
from app.models.product import Product
from app.models.production_order import ProductionOrder
from app.models.user import BigPK

PRODUCTION_STATUSES = ("planned", "in_progress", "paused", "completed", "cancelled")

# Status transitions allowed from each current status. Mirrors the exact
# shape of Order/Quotation's ALLOWED_TRANSITIONS (see models/order.py) so
# the service-layer check is identical in style.
#
# 'paused' is a real-world hold on an already-started batch -- a machine
# breakdown, a worker shortage, a quality question -- that isn't a
# cancellation: whatever's been produced so far (see production_service.
# log_partial_production) stays recorded, the remaining raw-material
# reservation stays held, and the batch resumes right where it left off.
# It can also be closed out as 'completed' directly from paused (accept
# whatever was produced and stop here) or 'cancelled' (abandon the rest).
ALLOWED_TRANSITIONS = {
    "planned": {"in_progress", "cancelled"},
    "in_progress": {"paused", "completed", "cancelled"},
    "paused": {"in_progress", "completed", "cancelled"},
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
    # Set only for a schedule created through the Production Order
    # scheduling flow (P5) -- see production_order_schedule_service.py.
    # NULL for a legacy batch auto-scheduled straight from order
    # confirmation (order_service._maybe_auto_schedule_production), which
    # predates the Production Order entity (P2) entirely. A schedule with
    # this set never reserves or releases raw material stock itself --
    # that's already owned by Material Allocation (P4,
    # production_order_material_service.allocate/release); see this
    # model's own note on planned_start/planned_end and
    # production_service.py's guard against mutating such a row through
    # the legacy batch endpoints.
    production_order_id: Mapped[int | None] = mapped_column(BigPK, ForeignKey("production_orders.id"), nullable=True)
    planned_quantity: Mapped[float] = mapped_column(DECIMAL(14, 4), nullable=False)
    # Cumulative across every recording made against this batch -- a
    # single completion (the common case), or several
    # production_service.log_partial_production calls plus a final
    # completion for whatever's left (a batch paused and resumed one or
    # more times). Never reset; each recording adds to it.
    produced_quantity: Mapped[float] = mapped_column(DECIMAL(14, 4), nullable=False, default=0)
    scheduled_start: Mapped[date] = mapped_column(DATE, nullable=False)
    scheduled_end: Mapped[date] = mapped_column(DATE, nullable=False)
    # Time-of-day precision for the new Production Order scheduling flow
    # (P5) -- deliberately additive, not a replacement for
    # scheduled_start/scheduled_end above. Those two are read at day
    # granularity by capacity_service, dashboard_service, report_service,
    # notification_service, feasibility_service and calendar_service;
    # widening their type to DATETIME would risk breaking every one of
    # those (comparing a bare `date` against a `datetime` raises in
    # Python) for a precision none of them need. A production-order-
    # linked schedule instead populates all four: scheduled_start/
    # scheduled_end as planned_start/planned_end's own calendar date, so
    # every existing day-granularity consumer keeps working unchanged,
    # while these two give the machine-conflict check and the Production
    # Order detail page the exact time a legacy batch never recorded.
    # NULL for a legacy batch (no production_order_id).
    planned_start: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    planned_end: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
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
    # Mandatory when status becomes 'paused' -- why production stopped
    # (machine breakdown, worker shortage, quality hold, ...). Cleared
    # implicitly by whatever transition leaves 'paused' next; only ever
    # reflects the most recent pause.
    pause_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Mandatory when this batch is completed with produced_quantity
    # different from planned_quantity (either direction) -- why the
    # actual output didn't match the plan. Distinct from
    # material_discrepancy_notes below, which is about raw-material
    # *consumption* vs. the BOM, not finished-goods output vs. plan.
    quantity_discrepancy_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Mandatory when a Production-Order-driven schedule's planned_quantity
    # is allowed to exceed that order's remaining unscheduled quantity --
    # see production_order_schedule_service.create_schedule/reschedule's
    # allow_overproduction path. Always NULL for a schedule that stayed
    # within the requirement, and for the legacy (non-Production-Order)
    # scheduling flow, which has no such cap to override.
    overproduction_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Set on completion (see production_service._record_output) when any
    # raw material's actual usage either exceeds its BOM line(s)'
    # admin-configured scrap_percent allowance, or comes in below the
    # bare zero-scrap requirement (physically implausible for the
    # reported produced_quantity) -- either way, admin gets a
    # notification (see notification_service.py). material_discrepancy_notes
    # is a JSON list of the specific per-material findings.
    material_discrepancy_flag: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    material_discrepancy_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Same admin-review escalation pattern as orders/purchase orders:
    # flagged when this batch is past scheduled_end and not yet completed
    # or cancelled -- a run behind schedule, the production-side mirror of
    # a customer order or purchase order running overdue. See
    # production_service.escalate_overdue_batches / admin_review.
    admin_review_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    admin_reviewed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    admin_reviewed_by: Mapped[int | None] = mapped_column(BigPK, ForeignKey("users.id"), nullable=True)
    admin_review_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    product: Mapped[Product] = relationship(foreign_keys=[product_id], lazy="joined")
    machine: Mapped[Machine | None] = relationship(foreign_keys=[machine_id], lazy="joined")
    order: Mapped[Order | None] = relationship(foreign_keys=[order_id], lazy="joined")
    production_order: Mapped[ProductionOrder | None] = relationship(foreign_keys=[production_order_id], lazy="joined")
