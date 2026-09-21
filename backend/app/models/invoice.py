from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.mysql import MEDIUMTEXT
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.customer import Customer
from app.models.mixins import SoftDeleteMixin, TimestampMixin
from app.models.order import Order
from app.models.quotation import Quotation
from app.models.user import BigPK

INVOICE_STATUSES = (
    "draft",
    "waiting_finance",
    "link_generated",
    "qr_ready",
    "awaiting_payment",
    "partially_paid",
    "paid",
    "voided",
)

# Status transitions allowed from each current status -- see order.py's own
# ALLOWED_TRANSITIONS for the shared pattern (checked via
# core/workflow.assert_transition_allowed). generate_payment_link doesn't
# walk this hop by hop (link_generated -> qr_ready -> awaiting_payment all
# happen inside one call, see invoice_service) -- it only needs to know
# which *starting* statuses are valid, which VOIDABLE_STATUSES /
# LINK_GENERATABLE_STATUSES below answer directly.
ALLOWED_TRANSITIONS = {
    "draft": {"waiting_finance"},
    "waiting_finance": {"link_generated", "voided"},
    "link_generated": {"qr_ready", "voided"},
    "qr_ready": {"awaiting_payment", "voided"},
    "awaiting_payment": {"awaiting_payment", "partially_paid", "paid", "voided"},
    "partially_paid": {"partially_paid", "paid", "voided"},
    "paid": set(),
    "voided": set(),
}

# Statuses Finance may (re)generate a payment link from -- everything
# after the link exists at all, up to (and including) partial payment.
# Excludes 'draft' (not yet routed to Finance), 'paid' and 'voided'
# (nothing left to collect).
LINK_GENERATABLE_STATUSES = {"waiting_finance", "link_generated", "qr_ready", "awaiting_payment", "partially_paid"}

# Statuses Finance may void from -- anything short of 'paid' or already
# 'voided'. Order cancellation (order_service.change_status) only ever
# reaches void through this same set, and only for the earlier subset
# (before 'awaiting_payment') -- see that function's own cancellation gate.
VOIDABLE_STATUSES = {"draft", "waiting_finance", "link_generated", "qr_ready", "awaiting_payment", "partially_paid"}

# Statuses at/after which a live payment request exists -- order_service's
# cancellation gate blocks a plain order cancellation once an invoice is
# here; Finance has to void it first (see invoice_service.void_invoice).
PAYMENT_REQUESTED_STATUSES = {"awaiting_payment", "partially_paid", "paid"}


class Invoice(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "invoices"

    id: Mapped[int] = mapped_column(BigPK, primary_key=True)
    invoice_number: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)
    order_id: Mapped[int] = mapped_column(BigPK, ForeignKey("orders.id"), unique=True, nullable=False)
    quotation_id: Mapped[int | None] = mapped_column(BigPK, ForeignKey("quotations.id"), nullable=True)
    customer_id: Mapped[int] = mapped_column(BigPK, ForeignKey("customers.id"), nullable=False)
    status: Mapped[str] = mapped_column(
        Enum(*INVOICE_STATUSES, name="invoice_status"), nullable=False, default="draft"
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    payment_link_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    payment_link_ref: Mapped[str | None] = mapped_column(String(120), nullable=True)
    payment_link_expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    qr_data_url: Mapped[str | None] = mapped_column(MEDIUMTEXT, nullable=True)
    voided_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    voided_by: Mapped[int | None] = mapped_column(BigPK, ForeignKey("users.id"), nullable=True)
    voided_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    order: Mapped[Order] = relationship(lazy="joined")
    quotation: Mapped[Quotation | None] = relationship(lazy="joined")
    customer: Mapped[Customer] = relationship(lazy="joined")
