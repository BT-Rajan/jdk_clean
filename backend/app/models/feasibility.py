from datetime import date, datetime

from sqlalchemy import DATE, DECIMAL, Boolean, DateTime, Enum, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.customer import Customer
from app.models.deal import Deal
from app.models.mixins import SoftDeleteMixin, TimestampMixin
from app.models.product import Product
from app.models.user import BigPK

FEASIBILITY_STATUSES = (
    "draft",
    "feasible",
    "exception_pending",
    "exception_approved",
    "exception_rejected",
    "closed",
    "converted",
    "expired",
)

# 'feasible' / 'exception_pending' are reached by the system-run check
# (feasibility_service.run_check), not a direct user-driven status jump.
# 'expired' is likewise system-driven (feasibility_service.
# escalate_expired_feasibility_checks) -- reachable from every open
# status, since a check that hasn't been converted by 11:59pm Kuwait
# time on the day it was generated expires regardless of where in the
# workflow it was sitting.
ALLOWED_TRANSITIONS = {
    "draft": {"feasible", "exception_pending", "expired"},
    "feasible": {"converted", "closed", "expired"},
    "exception_pending": {"exception_approved", "exception_rejected", "expired"},
    "exception_approved": {"converted", "closed", "expired"},
    "exception_rejected": {"closed", "expired"},
    "closed": set(),
    "converted": set(),
    "expired": set(),
}

# A quotation may only be generated against a feasibility check sitting in
# one of these statuses (see quotation_service.create_quotation). An
# expired check is never quotable -- that's the entire point of expiry.
QUOTABLE_STATUSES = {"feasible", "exception_approved"}

# A feasibility check counts as "open" (i.e. eligible for the 5-day stale
# escalation) while it's in any status that hasn't yet reached a terminal
# closed/converted/expired state. In practice a check almost always
# expires same-day long before it could ever reach 5 days stale -- this
# still exists for the (rare) case expiry itself is misconfigured or
# skipped for a run.
OPEN_STATUSES = {"draft", "feasible", "exception_pending", "exception_approved", "exception_rejected"}

# Why admin was notified: Sales overrode an infeasible result with a
# comment, or the check sat open past the 5-day SLA.
ADMIN_REVIEW_REASONS = ("override", "stale_open")


class FeasibilityCheck(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "feasibility_checks"

    id: Mapped[int] = mapped_column(BigPK, primary_key=True)
    feasibility_number: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)
    customer_id: Mapped[int] = mapped_column(BigPK, ForeignKey("customers.id"), nullable=False)
    # The deal this check belongs to (see models/deal.py) -- set on
    # creation, either inherited (rare for feasibility, since it's
    # usually the first stage) or newly minted right here.
    deal_id: Mapped[int | None] = mapped_column(BigPK, ForeignKey("deals.id"), nullable=True)
    status: Mapped[str] = mapped_column(
        Enum(*FEASIBILITY_STATUSES, name="feasibility_status"), nullable=False, default="draft"
    )
    # When the customer needs the requested quantity by, captured on the
    # request itself alongside each line's product + quantity.
    required_by_date: Mapped[date | None] = mapped_column(DATE, nullable=True)
    checked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # Sales' exception-approval decision (only set once exception_pending is
    # resolved) -- who decided it and why, separate from close_reason below.
    # This IS the "override with comment": approve=True on an infeasible
    # check means Sales chose to proceed anyway, and `exception_reason` is
    # the mandatory comment explaining why.
    exception_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    exception_by: Mapped[int | None] = mapped_column(BigPK, ForeignKey("users.id"), nullable=True)
    # Set when Sales closes this check without generating a quotation from it.
    close_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Admin notification -- mirrors Order.admin_review_required exactly (see
    # models/order.py), just with a `admin_review_reason` to distinguish the
    # two triggers here (an override vs. sitting open past the 5-day SLA).
    admin_review_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    admin_review_reason: Mapped[str | None] = mapped_column(
        Enum(*ADMIN_REVIEW_REASONS, name="feasibility_admin_review_reason"), nullable=True
    )
    admin_reviewed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    admin_reviewed_by: Mapped[int | None] = mapped_column(BigPK, ForeignKey("users.id"), nullable=True)
    admin_review_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    customer: Mapped[Customer] = relationship(lazy="joined")
    deal: Mapped[Deal | None] = relationship(lazy="joined")
    lines: Mapped[list["FeasibilityLine"]] = relationship(
        back_populates="feasibility",
        cascade="all, delete-orphan",
        order_by="FeasibilityLine.id",
    )


class FeasibilityLine(Base):
    __tablename__ = "feasibility_lines"

    id: Mapped[int] = mapped_column(BigPK, primary_key=True)
    feasibility_id: Mapped[int] = mapped_column(
        BigPK, ForeignKey("feasibility_checks.id", ondelete="CASCADE"), nullable=False
    )
    product_id: Mapped[int] = mapped_column(BigPK, ForeignKey("products.id"), nullable=False)
    quantity: Mapped[float] = mapped_column(DECIMAL(14, 4), nullable=False)
    # How much of `quantity` was already sitting in unreserved
    # finished-goods stock at check time, netted off before computing
    # raw-material/capacity requirements for the remainder. NULL when
    # nothing was covered by existing stock.
    covered_by_stock: Mapped[float | None] = mapped_column(DECIMAL(14, 4), nullable=True)
    # True when the product genuinely has no BOM/formula configured at
    # all (see bom_service.has_bom) -- feasibility can't be verified for
    # this line, so it's forced infeasible rather than silently passing.
    bom_missing: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    # NULL until run_check executes; then whether THIS line's raw-material
    # needs were fully covered by on-hand stock.
    is_feasible: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    # JSON list of {raw_material_id, code, name, unit, required, on_hand, shortfall}
    # for materials this line was short on. Empty/NULL when is_feasible is true.
    shortfall_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Machine-availability / time-required result for this line: does the
    # product's machine (products.machine_id) have enough free capacity,
    # between today and the check's required_by_date, for this quantity at
    # the product's production_hours_per_unit? NULL when the product has no
    # machine/time formula set, or no required_by_date was given on the
    # check (capacity can't be evaluated either way).
    capacity_ok: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    # JSON {machine, required_hours, available_hours, shortfall_hours} when capacity_ok is False.
    capacity_shortfall_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    # The date by which the remainder (quantity_to_produce) can actually
    # be supplied: today, if fully covered by finished-goods stock;
    # otherwise the machine/labor capacity scan's projected completion
    # date, starting from the next working day after today and skipping
    # non-working days (see settings_service.next_working_day). NULL when
    # raw materials are short (nothing honest to estimate until that's
    # resolved) or machine/time capacity isn't evaluable (no formula set,
    # or the scan found no vacant slot within its horizon). This is what
    # Sales sees as "when can the remainder be supplied" regardless of
    # whether a required_by_date was given on the check.
    estimated_ready_date: Mapped[date | None] = mapped_column(DATE, nullable=True)

    feasibility: Mapped[FeasibilityCheck] = relationship(back_populates="lines")
    product: Mapped[Product] = relationship(lazy="joined")
