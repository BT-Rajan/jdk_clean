from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, SmallInteger, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.mixins import SoftDeleteMixin, TimestampMixin
from app.models.user import BigPK

SUPPLIER_MODES_OF_SUPPLY = ("direct", "distributor", "broker", "import")

# Onboarding tracks getting a new supplier record fully set up and
# reviewed after the "New supplier" wizard creates it -- separate from
# `status` (active/inactive/suspended), which is whether the supplier is
# currently usable for purchase orders at all once onboarded. Mirrors
# app/models/customer.py's onboarding workflow exactly -- same shape,
# applied to suppliers instead of customers.
SUPPLIER_ONBOARDING_STATUSES = ("pending", "under_review", "active", "on_hold", "rejected")

ONBOARDING_ALLOWED_TRANSITIONS = {
    "pending": {"under_review"},
    "under_review": {"active", "rejected", "pending"},
    "active": {"on_hold"},
    "on_hold": {"under_review", "active"},
    "rejected": {"pending"},
}
# Rejecting or putting onboarding on hold needs a reason on record --
# same rule quotations/orders/production/customers apply to their own
# reason-gated transitions (see supplier_service.change_onboarding_status).
ONBOARDING_STATUSES_REQUIRING_REASON = {"rejected", "on_hold"}


class Supplier(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "suppliers"

    id: Mapped[int] = mapped_column(BigPK, primary_key=True)
    # Auto-generated via number_series (doc_type 'SUPPLIER') -- see
    # supplier_service.py. No longer typed in on the wizard.
    code: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    contact_person: Mapped[str | None] = mapped_column(String(120), nullable=True)
    email: Mapped[str | None] = mapped_column(String(120), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    address: Mapped[str | None] = mapped_column(String(255), nullable=True)
    city: Mapped[str | None] = mapped_column(String(80), nullable=True)
    country: Mapped[str | None] = mapped_column(String(80), nullable=True)
    payment_terms_days: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=30)
    mode_of_supply: Mapped[str | None] = mapped_column(
        Enum(*SUPPLIER_MODES_OF_SUPPLY, name="supplier_mode_of_supply"), nullable=True
    )
    rating: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)  # 1-5 stars
    status: Mapped[str] = mapped_column(
        Enum("active", "inactive", "suspended", name="supplier_status"),
        nullable=False,
        default="active",
    )
    onboarding_status: Mapped[str] = mapped_column(
        Enum(*SUPPLIER_ONBOARDING_STATUSES, name="supplier_onboarding_status"),
        nullable=False,
        default="pending",
    )
    # Reason the last time onboarding moved to 'rejected' or 'on_hold' --
    # set by supplier_service.change_onboarding_status, mirrors
    # Customer.onboarding_reason / Quotation.close_reason.
    onboarding_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Proof of registration -- an uploaded image or PDF, stored on disk
    # under uploads/supplier_ids/ (see id_document_service.py), this
    # column holding only the generated filename. id_verified is
    # admin-set after reviewing it; unlike Customer.id_verified, nothing
    # currently gates on this for suppliers.
    id_document_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    id_verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    id_verified_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    id_verified_by: Mapped[int | None] = mapped_column(BigPK, ForeignKey("users.id"), nullable=True)
