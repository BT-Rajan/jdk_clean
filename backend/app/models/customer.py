from datetime import date, datetime

from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import DECIMAL, JSON, Boolean, Date, DateTime, Enum, ForeignKey, SmallInteger, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.mixins import SoftDeleteMixin, TimestampMixin
from app.models.user import BigPK

if TYPE_CHECKING:
    from app.models.user import User

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

# "Customer Master" field pass -- brings this screen in line with the
# standard master-data reference list (Type/Name/Avatar/.../Journal
# Items). Every field below is plain data with no automation behind it:
# this app has no GL/accounting module, no e-invoicing or dunning
# engine, and no purchase-RFQ workflow, so account_receivable/
# account_payable/auto_post_bills/fiscal_position/follow_up_*/
# reminder_*/group_rfq/buyer_id/etc. are all just stored values -- no
# posting, no auto-generated reminders, no RFQ documents. See
# migrations/2026-10-03_customer_master_fields.sql for the full
# rationale per field.
PAYMENT_METHODS = ("cash", "credit_card", "bank_transfer", "cheque", "other")
AUTO_POST_BILLS_MODES = ("manual", "automatic")
FOLLOW_UP_STAGES = ("none", "15_days", "30_days", "45_days", "legal")
FOLLOW_UP_STATUSES = ("up_to_date", "in_progress", "overdue", "escalated")
REMINDER_MODES = ("automatic", "manual")


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
    # Who currently owns the operational relationship with this customer
    # -- set via POST /api/customers/{id}/assign (Sales Head/admin only,
    # see app/api/customers.py), never a plain field edit. A team_member
    # (salesman) sees only customers assigned to them and nothing else
    # (app/crud/master_data.py CustomerCRUD._scope_query; app/core/
    # sales_scope.py for everything linked to a customer); a
    # department_head sees every customer their department's page
    # access allows, unfiltered. Distinct from created_by (below, via
    # TimestampMixin), which never changes once set -- reassigning a
    # customer changes who currently owns it, not who created it.
    assigned_to: Mapped[int | None] = mapped_column(BigPK, ForeignKey("users.id"), nullable=True)
    # The assignee's name is served with the customer so a Sales Manager
    # (who can't call the admin-only /api/users) still sees who owns it.
    # Deliberately lazy="select", NOT "joined": Customer is eager-loaded
    # by orders, deals, QC requests and more, and a joined assignee (with
    # User's own joined relationships) multiplied those joins past
    # MariaDB's 61-table limit. CustomerCRUD select-in loads it for the
    # customer list/detail instead -- see _base_query there.
    assignee: Mapped["User | None"] = relationship("User", foreign_keys=[assigned_to], lazy="select", viewonly=True)
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

    # -- Core header / identity --
    # Uploaded logo/photo, same storage convention as id_document_filename
    # above (see app/services/avatar_service.py) -- just the generated
    # filename, image only (no PDF, unlike the id document).
    avatar_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # -- Primary contact & address --
    # Links an individual contact to a parent company record (both rows
    # live in this same table) -- e.g. a purchasing contact filed under
    # the company they work for. Self-referential; see `parent_company`
    # relationship below and CustomerCRUD._validate_parent_company for
    # the "can't be its own parent" / "must exist" checks.
    parent_company_id: Mapped[int | None] = mapped_column(BigPK, ForeignKey("customers.id"), nullable=True)
    job_position: Mapped[str | None] = mapped_column(String(120), nullable=True)
    website: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Free-form labels, stored as a JSON array of strings -- deliberately
    # not a separate lookup table (same reasoning as `category` above:
    # no fixed picklist, low cardinality, no other consumer).
    tags: Mapped[list | None] = mapped_column(JSON, nullable=True)
    # Structured address components, additive to the existing
    # billing_address/shipping_address free-text blocks above (kept as
    # -is, still used for quotations/orders) -- these back the
    # Street 1/Street 2/State sub-fields the reference Customer Master
    # layout expects; city/country already existed.
    address_line1: Mapped[str | None] = mapped_column(String(255), nullable=True)
    address_line2: Mapped[str | None] = mapped_column(String(255), nullable=True)
    state: Mapped[str | None] = mapped_column(String(80), nullable=True)

    # -- Sales configuration --
    payment_method: Mapped[str | None] = mapped_column(
        Enum(*PAYMENT_METHODS, name="customer_payment_method"), nullable=True
    )
    # Free-text label only -- this app has no pricing-rule/pricelist
    # engine, so nothing downstream reads this to actually reprice a
    # quotation; it's a stored reference value same as `category`.
    pricelist: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # -- Purchase configuration --
    # Mirrors sales configuration's shape but namespaced separately --
    # this app keeps Customer and Supplier as distinct entities, so
    # these describe purchasing *from* this contact when it also acts
    # as one (e.g. a company that's both a customer and a source of
    # consignment stock), not this customer's own supplier relationship.
    group_rfq: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    buyer_id: Mapped[int | None] = mapped_column(BigPK, ForeignKey("users.id"), nullable=True)
    purchase_payment_terms_days: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    purchase_payment_terms_type: Mapped[str | None] = mapped_column(
        Enum(*PAYMENT_TERMS_TYPES, name="customer_purchase_payment_terms_type"), nullable=True
    )
    purchase_payment_method: Mapped[str | None] = mapped_column(
        Enum(*PAYMENT_METHODS, name="customer_purchase_payment_method"), nullable=True
    )
    receipt_reminder: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    supplier_currency: Mapped[str | None] = mapped_column(String(10), nullable=True)

    # -- Fiscal & misc --
    # Free-text label -- no tax-mapping engine exists here, so nothing
    # reads this to actually change tax treatment; stored reference only.
    fiscal_position: Mapped[str | None] = mapped_column(String(120), nullable=True)
    # Internal/external key or legacy code, distinct from `code` (the
    # Civil ID / Registration number) and `customer_number` (the
    # auto-generated internal reference) above.
    reference: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # -- Accounting & general ledger --
    # This app has no chart-of-accounts/GL module -- these four are
    # stored reference values only (no posting, no bank integration).
    # bank_accounts is a JSON array of {bank_name, account_number, iban,
    # swift_code} objects -- see schemas/customer.py CustomerBankAccount.
    bank_accounts: Mapped[list | None] = mapped_column(JSON, nullable=True)
    account_receivable: Mapped[str | None] = mapped_column(String(50), nullable=True)
    account_payable: Mapped[str | None] = mapped_column(String(50), nullable=True)
    auto_post_bills: Mapped[str | None] = mapped_column(
        Enum(*AUTO_POST_BILLS_MODES, name="customer_auto_post_bills"), nullable=True
    )

    # -- Invoice follow-ups & e-invoicing --
    # No dunning/e-invoicing engine exists here either -- these are
    # manually-set status fields for staff to track collections by hand,
    # not automation. Journal Items has no field of its own: the detail
    # page links out to this customer's existing Orders/Payments
    # activity instead (there's no separate ledger/journal concept).
    follow_up_stage: Mapped[str | None] = mapped_column(
        Enum(*FOLLOW_UP_STAGES, name="customer_follow_up_stage"), nullable=True
    )
    follow_up_status: Mapped[str | None] = mapped_column(
        Enum(*FOLLOW_UP_STATUSES, name="customer_follow_up_status"), nullable=True
    )
    reminder_mode: Mapped[str | None] = mapped_column(
        Enum(*REMINDER_MODES, name="customer_reminder_mode"), nullable=True
    )
    next_reminder_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    followup_responsible_id: Mapped[int | None] = mapped_column(BigPK, ForeignKey("users.id"), nullable=True)

    # Read via CustomerOut.parent_company_name (a plain @property below,
    # picked up by pydantic's from_attributes the same as any other
    # attribute) -- lazy-loaded, fine at this volume/access pattern.
    @property
    def assigned_to_name(self) -> str | None:
        return self.assignee.full_name if self.assignee is not None else None

    parent_company: Mapped["Customer | None"] = relationship(
        "Customer", remote_side="Customer.id", foreign_keys=[parent_company_id]
    )

    @property
    def parent_company_name(self) -> str | None:
        return self.parent_company.name if self.parent_company else None
