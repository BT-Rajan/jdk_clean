from datetime import date

from sqlalchemy import DATE, DECIMAL, Boolean, Enum, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.customer import Customer
from app.models.deal import Deal
from app.models.mixins import SoftDeleteMixin, TimestampMixin
from app.models.product import Product
from app.models.user import BigPK

QUOTATION_STATUSES = ("draft", "sent", "accepted", "rejected", "expired", "converted")

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
    subtotal_amount: Mapped[float] = mapped_column(DECIMAL(14, 2), nullable=False, default=0)
    tax_rate: Mapped[float] = mapped_column(DECIMAL(5, 2), nullable=False, default=0)
    tax_amount: Mapped[float] = mapped_column(DECIMAL(14, 2), nullable=False, default=0)
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
    line_total: Mapped[float] = mapped_column(DECIMAL(14, 2), nullable=False)

    quotation: Mapped[Quotation] = relationship(back_populates="lines")
    product: Mapped[Product] = relationship(lazy="joined")
