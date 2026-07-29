from datetime import datetime

from sqlalchemy import DECIMAL, Boolean, DateTime, Enum, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.customer import Customer
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
)

# 'feasible' / 'exception_pending' are reached by the system-run check
# (feasibility_service.run_check), not a direct user-driven status jump.
ALLOWED_TRANSITIONS = {
    "draft": {"feasible", "exception_pending"},
    "feasible": {"converted", "closed"},
    "exception_pending": {"exception_approved", "exception_rejected"},
    "exception_approved": {"converted", "closed"},
    "exception_rejected": {"closed"},
    "closed": set(),
    "converted": set(),
}

# A quotation may only be generated against a feasibility check sitting in
# one of these statuses (see quotation_service.create_quotation).
QUOTABLE_STATUSES = {"feasible", "exception_approved"}


class FeasibilityCheck(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "feasibility_checks"

    id: Mapped[int] = mapped_column(BigPK, primary_key=True)
    feasibility_number: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)
    customer_id: Mapped[int] = mapped_column(BigPK, ForeignKey("customers.id"), nullable=False)
    status: Mapped[str] = mapped_column(
        Enum(*FEASIBILITY_STATUSES, name="feasibility_status"), nullable=False, default="draft"
    )
    checked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # Sales' exception-approval decision (only set once exception_pending is
    # resolved) -- who decided it and why, separate from close_reason below.
    exception_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    exception_by: Mapped[int | None] = mapped_column(BigPK, ForeignKey("users.id"), nullable=True)
    # Set when Sales closes this check without generating a quotation from it.
    close_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    customer: Mapped[Customer] = relationship(lazy="joined")
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
    # NULL until run_check executes; then whether THIS line's raw-material
    # needs were fully covered by on-hand stock.
    is_feasible: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    # JSON list of {raw_material_id, code, name, unit, required, on_hand, shortfall}
    # for materials this line was short on. Empty/NULL when is_feasible is true.
    shortfall_json: Mapped[str | None] = mapped_column(Text, nullable=True)

    feasibility: Mapped[FeasibilityCheck] = relationship(back_populates="lines")
    product: Mapped[Product] = relationship(lazy="joined")
