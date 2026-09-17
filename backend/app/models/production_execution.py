from datetime import datetime

from sqlalchemy import DECIMAL, DateTime, Enum, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.machine import Machine
from app.models.mixins import TimestampMixin
from app.models.product import Product
from app.models.production_order import ProductionOrder
from app.models.production_schedule import ProductionSchedule
from app.models.user import BigPK

EXECUTION_STATUSES = ("in_progress", "completed", "cancelled")
# 'not_started' is never stored -- it's the absence of any execution row
# against a schedule, exactly the same computed-absence verdict P3's
# 'not_calculated', P4's 'not_allocated' and P5's 'unscheduled' already
# are for their own child tables, not a stored enum value here.

ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    "in_progress": {"completed", "cancelled"},
    "completed": set(),
    "cancelled": set(),
}


class ProductionExecution(Base, TimestampMixin):
    """One actual manufacturing run against a Production Order -- the
    WHAT-HAPPENED record (P6) sitting alongside ProductionOrder (P2,
    WHAT) and ProductionSchedule (P5, WHEN/WHERE for this flow). See
    docs/production-lifecycle.md: this is exactly the three-way split
    that document recommended, now complete for the Production Order
    chain (the older auto-scheduled-batch flow still folds all three
    into ProductionSchedule itself and is untouched by this pass).

    A Production Order may have several of these across its lifetime
    (multiple runs -- see the P6 spec's "multiple execution runs"
    section); each is independent and, once 'completed' or 'cancelled',
    immutable. Total produced/remaining for a Production Order is always
    derived by summing this table's 'completed' rows (see
    production_execution_service.get_progress) -- never a duplicated
    running total stored on the Production Order itself.

    started_at/ended_at, like the legacy ProductionSchedule.actual_start/
    actual_end, are always populated from core.timezone.
    now_kuwait_naive() -- server-authoritative Kuwait time, never a
    client-supplied timestamp. (An earlier pass had the legacy fields
    stamped via datetime.now(timezone.utc), effectively UTC wall-clock
    time since this app's DB server timezone is itself UTC; that
    inconsistency, and the equivalent one in every table's created_at/
    updated_at via TimestampMixin, was fixed application-wide -- see
    production_service.py and models/mixins.py.)
    """

    __tablename__ = "production_executions"

    id: Mapped[int] = mapped_column(BigPK, primary_key=True)
    production_order_id: Mapped[int] = mapped_column(BigPK, ForeignKey("production_orders.id"), nullable=False)
    schedule_id: Mapped[int] = mapped_column(BigPK, ForeignKey("production_schedules.id"), nullable=False)
    # Mirrors production_orders.product_id / production_schedules.
    # machine_id at creation time -- same direct-storage convention every
    # other table in this chain already uses (ProductionOrder.product_id,
    # ProductionSchedule.product_id), so this table can be listed/
    # filtered without joining through both parents every time.
    product_id: Mapped[int] = mapped_column(BigPK, ForeignKey("products.id"), nullable=False)
    machine_id: Mapped[int | None] = mapped_column(BigPK, ForeignKey("machines.id"), nullable=True)
    planned_quantity: Mapped[float] = mapped_column(DECIMAL(14, 4), nullable=False)
    # Set only on completion -- 0 for the entire 'in_progress' lifetime,
    # same "the actual figure isn't known until the run is done" stance
    # as leaving it unset would express, without needing a nullable
    # column and the None-vs-zero ambiguity that would introduce.
    produced_quantity: Mapped[float] = mapped_column(DECIMAL(14, 4), nullable=False, default=0)
    # How much of produced_quantity has actually been released into
    # FinishedGoodsInventory (P7) -- 0 until an external QC report
    # accepts this run (see qc_service._release_execution_fg). Kept as
    # its own running total rather than inferring "released" from
    # produced_quantity directly, so a run can sit fully produced but
    # still QC-pending: production completion and QC release are
    # deliberately separate facts (see docs/production-lifecycle.md and
    # the P7 spec's own "Production Completion vs Release" section).
    # Never exceeds produced_quantity.
    released_quantity: Mapped[float] = mapped_column(DECIMAL(14, 4), nullable=False, default=0)
    started_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    status: Mapped[str] = mapped_column(
        Enum(*EXECUTION_STATUSES, name="production_execution_status"), nullable=False, default="in_progress"
    )
    # Who started/completed this run -- the existing user/audit
    # infrastructure (see audit_service) already records every field
    # change generically; these two are kept as their own columns
    # instead because "who started production" and "who signed off the
    # actual output" are specific facts this record itself should be
    # able to answer without a join into the audit log.
    started_by: Mapped[int | None] = mapped_column(BigPK, ForeignKey("users.id"), nullable=True)
    completed_by: Mapped[int | None] = mapped_column(BigPK, ForeignKey("users.id"), nullable=True)
    cancel_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    production_order: Mapped[ProductionOrder] = relationship(foreign_keys=[production_order_id], lazy="joined")
    schedule: Mapped[ProductionSchedule] = relationship(foreign_keys=[schedule_id], lazy="joined")
    product: Mapped[Product] = relationship(foreign_keys=[product_id], lazy="joined")
    machine: Mapped[Machine | None] = relationship(foreign_keys=[machine_id], lazy="joined")
