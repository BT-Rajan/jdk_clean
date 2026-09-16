from datetime import datetime

from decimal import Decimal

from sqlalchemy import DECIMAL, Boolean, DateTime, Enum, ForeignKey, SmallInteger, String, Text
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

# Categorical payment terms alongside the existing numeric
# `payment_terms_days` below -- 'credit' is the only one that actually
# gates on days (see schemas/customer.py's cross-field check: credit
# requires payment_terms_days > 0). 'cash'/'advance'/'custom' don't
# change any downstream behavior (order_service's credit-limit check
# already keys off credit_limit, not this), this is classification for
# filtering/reporting only -- same role as `category` below.
PAYMENT_TERMS_TYPES = ("cash", "advance", "credit", "custom")


class Customer(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "customers"

    id: Mapped[int] = mapped_column(BigPK, primary_key=True)
    # Internal reference, auto-generated via number_series (doc_type
    # 'CUSTOMER') -- see customer_service.py. Distinct from `code` below.
    customer_number: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)
    customer_type: Mapped[str] = mapped_column(
        Enum(*CUSTOMER_TYPES, name="customer_type"), nullable=False, default="business"
    )
    # Civil ID for an individual, registration number for a business --
    # see customer_type above. NULL for a prospective customer (raised
    # for a feasibility check or quotation before they've been formally
    # onboarded, see onboarding_status below) who hasn't provided this
    # yet -- can move from NULL to a real value later, but is locked
    # once set, same as `name` (see schemas/customer.py CustomerUpdate).
    code: Mapped[str | None] = mapped_column(String(30), unique=True, nullable=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    # Display/trading name shown on quotations etc. when it differs from
    # the legal/registered `name` above (e.g. a business trading under a
    # brand different from its registration papers) -- optional, falls
    # back to `name` everywhere it'd be shown. No separate "short name"
    # field: it would just duplicate this with no distinct consumer.
    trade_name: Mapped[str | None] = mapped_column(String(150), nullable=True)
    contact_person: Mapped[str | None] = mapped_column(String(120), nullable=True)
    email: Mapped[str | None] = mapped_column(String(120), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    # Backup contact only, used if the primary is unreachable -- not
    # validated against uniqueness/duplicates the way `phone`/`email` are.
    alternate_phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    alternate_email: Mapped[str | None] = mapped_column(String(120), nullable=True)
    billing_address: Mapped[str | None] = mapped_column(String(255), nullable=True)
    shipping_address: Mapped[str | None] = mapped_column(String(255), nullable=True)
    city: Mapped[str | None] = mapped_column(String(80), nullable=True)
    country: Mapped[str | None] = mapped_column(String(80), nullable=True)
    credit_limit: Mapped[float] = mapped_column(DECIMAL(14, 2), nullable=False, default=0)
    payment_terms_days: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=30)
    # See PAYMENT_TERMS_TYPES above.
    payment_terms_type: Mapped[str] = mapped_column(
        Enum(*PAYMENT_TERMS_TYPES, name="customer_payment_terms_type"), nullable=False, default="credit"
    )
    # Free-text operational classification for filtering/reporting only --
    # same role and shape as raw_materials.category / products.category,
    # deliberately not a fixed picklist (varies per business) and
    # deliberately not a broader CRM segment/industry/owner/priority set,
    # which would have no consumer anywhere in this app.
    category: Mapped[str | None] = mapped_column(String(100), nullable=True)
    # Overrides Settings' global large_discount_approval_threshold for
    # this customer only -- NULL means "use the global setting". See
    # settings_service.get_effective_discount_approval_threshold.
    discount_approval_threshold_override: Mapped[Decimal | None] = mapped_column(DECIMAL(5, 2), nullable=True)
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
    # Proof of `code` (the Civil ID / Registration number above) -- an
    # uploaded image or PDF, stored on disk under uploads/customer_ids/
    # (see id_document_service.py), this column holding only the
    # generated filename. id_verified is admin-set after reviewing it;
    # order_service.change_status refuses to extend credit (credit_limit
    # > 0) to a customer whose id isn't verified yet.
    id_document_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    id_verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    id_verified_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    id_verified_by: Mapped[int | None] = mapped_column(BigPK, ForeignKey("users.id"), nullable=True)
