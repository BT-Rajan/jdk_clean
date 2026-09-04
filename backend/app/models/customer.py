from sqlalchemy import DECIMAL, Enum, SmallInteger, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.mixins import SoftDeleteMixin, TimestampMixin
from app.models.user import BigPK

# Onboarding tracks getting a new customer record fully set up and
# reviewed after the "New customer" wizard creates it -- separate from
# `status` (active/inactive), which is whether the customer account is
# currently usable at all once onboarded. A customer can be onboarded
# (onboarding_status == 'active') and still be toggled inactive later,
# same as any other master record.
CUSTOMER_ONBOARDING_STATUSES = ("pending", "under_review", "active", "on_hold", "rejected")

ONBOARDING_ALLOWED_TRANSITIONS = {
    "pending": {"under_review"},
    "under_review": {"active", "rejected", "pending"},
    "active": {"on_hold"},
    "on_hold": {"under_review", "active"},
    "rejected": {"pending"},
}
# Rejecting or putting onboarding on hold needs a reason on record --
# same rule quotations/orders/production/etc. apply to their own
# reason-gated transitions (see customer_service.change_onboarding_status).
ONBOARDING_STATUSES_REQUIRING_REASON = {"rejected", "on_hold"}

# Whether the customer is a private person or a registered business --
# asked as the first question in the onboarding wizard because it decides
# what `code` actually means: a civil ID number for an individual, a
# registration number for a business. Like `name`, `code` is locked after
# creation (see schemas/customer.py CustomerUpdate) since it's the
# identifier the rest of the app keys off of.
CUSTOMER_TYPES = ("individual", "business")


class Customer(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "customers"

    id: Mapped[int] = mapped_column(BigPK, primary_key=True)
    customer_type: Mapped[str] = mapped_column(
        Enum(*CUSTOMER_TYPES, name="customer_type"), nullable=False, default="business"
    )
    # Civil ID for an individual, registration number for a business --
    # see customer_type above.
    code: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    nature_of_business: Mapped[str | None] = mapped_column(String(150), nullable=True)
    contact_person: Mapped[str | None] = mapped_column(String(120), nullable=True)
    email: Mapped[str | None] = mapped_column(String(120), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    billing_address: Mapped[str | None] = mapped_column(String(255), nullable=True)
    shipping_address: Mapped[str | None] = mapped_column(String(255), nullable=True)
    city: Mapped[str | None] = mapped_column(String(80), nullable=True)
    country: Mapped[str | None] = mapped_column(String(80), nullable=True)
    credit_limit: Mapped[float] = mapped_column(DECIMAL(14, 2), nullable=False, default=0)
    payment_terms_days: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=30)
    status: Mapped[str] = mapped_column(
        Enum("active", "inactive", name="customer_status"), nullable=False, default="active"
    )
    onboarding_status: Mapped[str] = mapped_column(
        Enum(*CUSTOMER_ONBOARDING_STATUSES, name="customer_onboarding_status"),
        nullable=False,
        default="pending",
    )
    # Sales/admin's reason the last time onboarding moved to 'rejected' or
    # 'on_hold' -- set by customer_service.change_onboarding_status,
    # mirrors Quotation.close_reason.
    onboarding_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
