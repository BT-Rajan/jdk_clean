from datetime import date, datetime

from sqlalchemy import DATE, DECIMAL, Boolean, DateTime, Enum, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.customer import Customer
from app.models.deal import Deal
from app.models.mixins import SoftDeleteMixin, TimestampMixin
from app.models.product import Product
from app.models.user import BigPK

QUOTATION_STATUSES = ("draft", "sent", "accepted", "rejected", "expired", "converted")

# Which of the admin's two (see doc_template_service.LANGUAGES) uploaded
# quotation templates this quotation was raised in -- set at creation
# (Sales' choice on the "New quotation" form) and used as the default for
# Print/Email; a caller can still request the other language's PDF via
# the `language` query param without changing this.
QUOTATION_LANGUAGES = ("en", "ar")

# Status transitions allowed from each current status. Used by the service
# layer to reject invalid jumps (e.g. draft -> converted directly).
ALLOWED_TRANSITIONS = {
    "draft": {"sent", "rejected"},
    "sent": {"accepted", "rejected", "expired"},
    "accepted": {"converted"},
    "rejected": set(),
    "expired": set(),
    "converted": set(),
}

# Sales closing a quotation without generating an order must supply a
# reason (see quotation_service.change_status); 'rejected' is the only
# manually-driven terminal-without-order status -- 'expired' is a
# calendar-driven state, not a deliberate close.
STATUSES_REQUIRING_CLOSE_REASON = {"rejected"}


class Quotation(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "quotations"

    id: Mapped[int] = mapped_column(BigPK, primary_key=True)
    quotation_number: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)
    customer_id: Mapped[int] = mapped_column(BigPK, ForeignKey("customers.id"), nullable=False)
    # The deal this quotation belongs to (see models/deal.py) -- inherited
    # from its feasibility check if it has one, otherwise newly minted.
    deal_id: Mapped[int | None] = mapped_column(BigPK, ForeignKey("deals.id"), nullable=True)
    quotation_date: Mapped[date] = mapped_column(DATE, nullable=False)
    valid_until: Mapped[date | None] = mapped_column(DATE, nullable=True)
    status: Mapped[str] = mapped_column(
        Enum(*QUOTATION_STATUSES, name="quotation_status"), nullable=False, default="draft"
    )
    language: Mapped[str] = mapped_column(
        Enum(*QUOTATION_LANGUAGES, name="quotation_language"), nullable=False, default="en"
    )
    subtotal_amount: Mapped[float] = mapped_column(DECIMAL(14, 2), nullable=False, default=0)
    # Percentage, e.g. 0 or 10 -- a whole-document discount applied on
    # top of the already line-discounted subtotal.
    discount_percent: Mapped[float] = mapped_column(DECIMAL(5, 2), nullable=False, default=0)
    discount_amount: Mapped[float] = mapped_column(DECIMAL(14, 2), nullable=False, default=0)
    total_amount: Mapped[float] = mapped_column(DECIMAL(14, 2), nullable=False, default=0)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    converted_order_id: Mapped[int | None] = mapped_column(BigPK, nullable=True)
    # Every quotation must originate from a passed/exception-approved
    # feasibility check (enforced in quotation_service.create_quotation).
    feasibility_id: Mapped[int | None] = mapped_column(
        BigPK, ForeignKey("feasibility_checks.id"), nullable=True
    )
    # True when the system drafted this automatically because a
    # feasibility check just passed (see feasibility_service.py's
    # auto-creation hook), false for a person-created quotation. Purely
    # informational -- an auto-created quotation is a completely normal,
    # editable/deletable draft otherwise.
    auto_created: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # Set when Sales closes this quotation without converting it to an order.
    close_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    # A quotation whose discount (document-level or any single line's) is
    # at/above Settings -> large_discount_approval_threshold can't leave
    # 'draft' until an admin approves it.
    approved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    approved_by: Mapped[int | None] = mapped_column(BigPK, ForeignKey("users.id"), nullable=True)
    # Set when this quotation was created (or last edited) despite a raw
    # material it needs also being needed by another still-open
    # quotation/order, and Sales explicitly acknowledged that overlap --
    # see quotation_service.check_material_conflicts. A snapshot of what
    # was flagged at that moment, not a live check (availability moves on).
    material_conflict_acknowledged: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    material_conflict_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    customer: Mapped[Customer] = relationship(lazy="joined")
    deal: Mapped[Deal | None] = relationship(lazy="joined")
    lines: Mapped[list["QuotationDetail"]] = relationship(
        back_populates="quotation",
        cascade="all, delete-orphan",
        order_by="QuotationDetail.id",
    )


class QuotationDetail(Base):
    __tablename__ = "quotation_details"

    id: Mapped[int] = mapped_column(BigPK, primary_key=True)
    quotation_id: Mapped[int] = mapped_column(
        BigPK, ForeignKey("quotations.id", ondelete="CASCADE"), nullable=False
    )
    product_id: Mapped[int] = mapped_column(BigPK, ForeignKey("products.id"), nullable=False)
    quantity: Mapped[float] = mapped_column(DECIMAL(14, 4), nullable=False)
    unit_price: Mapped[float] = mapped_column(DECIMAL(14, 2), nullable=False)
    # Percentage, e.g. 0 or 10 -- this line's own discount, applied
    # before the document-level discount_percent.
    discount_percent: Mapped[float] = mapped_column(DECIMAL(5, 2), nullable=False, default=0)
    line_total: Mapped[float] = mapped_column(DECIMAL(14, 2), nullable=False)

    quotation: Mapped[Quotation] = relationship(back_populates="lines")
    product: Mapped[Product] = relationship(lazy="joined")
