from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator


class CustomerCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    customer_type: str = Field(pattern="^(individual|business)$")
    # Optional -- omit for a prospective customer (raised for a
    # feasibility check or quotation before they're formally onboarded)
    # who hasn't provided their Civil ID / Registration number yet. The
    # full onboarding wizard still requires it client-side; this is only
    # optional at this layer for that prospective-customer path.
    code: str | None = Field(default=None, max_length=30)
    name: str = Field(min_length=1, max_length=150)
    trade_name: str | None = Field(default=None, max_length=150)
    contact_person: str | None = Field(default=None, max_length=120)
    email: EmailStr | None = Field(default=None, max_length=120)
    phone: str | None = Field(default=None, max_length=30)
    alternate_phone: str | None = Field(default=None, max_length=30)
    alternate_email: EmailStr | None = Field(default=None, max_length=120)
    billing_address: str | None = Field(default=None, max_length=255)
    shipping_address: str | None = Field(default=None, max_length=255)
    city: str | None = Field(default=None, max_length=80)
    country: str | None = Field(default=None, max_length=80)
    category: str | None = Field(default=None, max_length=100)
    credit_limit: float = Field(default=0, ge=0)
    payment_terms_days: int = Field(default=30, ge=0)
    payment_terms_type: str = Field(default="credit", pattern="^(cash|advance|credit|custom)$")
    # Overrides Settings' global large-discount approval threshold for
    # this customer only -- blank/omitted means "use the global setting".
    discount_approval_threshold_override: float | None = Field(default=None, ge=0, le=100)
    status: str = Field(default="active", pattern="^(active|inactive)$")
    notes: str | None = Field(default=None, max_length=5000)

    @model_validator(mode="after")
    def _credit_terms_need_days(self) -> "CustomerCreate":
        if self.payment_terms_type == "credit" and self.payment_terms_days <= 0:
            raise ValueError("Credit days is required (must be greater than 0) when payment terms is Credit.")
        return self


class CustomerUpdate(BaseModel):
    """name is deliberately absent -- it's locked after creation (see
    CustomerOnboardingWizardPage and CustomerFormPage on the frontend).
    code (civil ID / registration number) is present but one-directional:
    CustomerCRUD.update rejects trying to change it once already set --
    this only exists so a prospective customer's code (NULL at creation,
    see CustomerCreate) can be filled in later once they provide it.
    Every other field, including customer_type, is editable at any time.
    customer_number and the id_verified/id_document
    fields are also absent -- customer_number is system-generated, and
    id_verified/id_document_filename change only via the dedicated
    endpoints in api/customers.py (verify-id, id-document), never a plain
    field edit.

    payment_terms_type/payment_terms_days are deliberately NOT
    cross-validated here the way CustomerCreate does: an update payload
    commonly sets only one of the two (e.g. just raising the days on an
    already-credit customer), and this schema has no access to what the
    other field's existing value is. CustomerCRUD.update does that check
    instead, once it has the existing row to fall back on -- same
    pattern as RawMaterialCRUD's stock-threshold check."""

    model_config = ConfigDict(str_strip_whitespace=True)

    code: str | None = Field(default=None, max_length=30)
    customer_type: str | None = Field(default=None, pattern="^(individual|business)$")
    trade_name: str | None = Field(default=None, max_length=150)
    contact_person: str | None = Field(default=None, max_length=120)
    email: EmailStr | None = Field(default=None, max_length=120)
    phone: str | None = Field(default=None, max_length=30)
    alternate_phone: str | None = Field(default=None, max_length=30)
    alternate_email: EmailStr | None = Field(default=None, max_length=120)
    billing_address: str | None = Field(default=None, max_length=255)
    shipping_address: str | None = Field(default=None, max_length=255)
    city: str | None = Field(default=None, max_length=80)
    country: str | None = Field(default=None, max_length=80)
    category: str | None = Field(default=None, max_length=100)
    credit_limit: float | None = Field(default=None, ge=0)
    payment_terms_days: int | None = Field(default=None, ge=0)
    payment_terms_type: str | None = Field(default=None, pattern="^(cash|advance|credit|custom)$")
    discount_approval_threshold_override: float | None = Field(default=None, ge=0, le=100)
    status: str | None = Field(default=None, pattern="^(active|inactive)$")
    notes: str | None = Field(default=None, max_length=5000)


class CustomerOut(BaseModel):
    id: int
    customer_number: str
    customer_type: str
    code: str | None
    name: str
    trade_name: str | None
    contact_person: str | None
    email: str | None
    phone: str | None
    alternate_phone: str | None
    alternate_email: str | None
    billing_address: str | None
    shipping_address: str | None
    city: str | None
    country: str | None
    category: str | None
    credit_limit: float
    payment_terms_days: int
    payment_terms_type: str
    discount_approval_threshold_override: float | None
    status: str
    onboarding_status: str
    onboarding_reason: str | None
    notes: str | None
    id_document_filename: str | None
    id_verified: bool
    id_verified_at: datetime | None
    id_verified_by: int | None
    # Exposed here even though Raw Materials' CustomerOut-equivalent
    # doesn't (that master relies on HistoryTimeline alone for
    # created/updated) -- explicitly requested for Client Master's own
    # list "Created Date" column and detail-page System Information
    # section (see CustomersListPage/CustomerDetailPage). Zero-risk: the
    # columns already exist on every row via TimestampMixin, this is
    # only exposing them, no migration involved.
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CustomerOnboardingStatusUpdate(BaseModel):
    status: str = Field(pattern="^(pending|under_review|active|on_hold|rejected)$")
    reason: str | None = None
