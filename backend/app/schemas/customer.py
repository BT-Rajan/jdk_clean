from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


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
    nature_of_business: str | None = Field(default=None, max_length=150)
    contact_person: str | None = Field(default=None, max_length=120)
    email: EmailStr | None = Field(default=None, max_length=120)
    phone: str | None = Field(default=None, max_length=30)
    billing_address: str | None = Field(default=None, max_length=255)
    shipping_address: str | None = Field(default=None, max_length=255)
    city: str | None = Field(default=None, max_length=80)
    country: str | None = Field(default=None, max_length=80)
    credit_limit: float = Field(default=0, ge=0)
    payment_terms_days: int = Field(default=30, ge=0)
    status: str = Field(default="active", pattern="^(active|inactive)$")
    notes: str | None = Field(default=None, max_length=5000)


class CustomerUpdate(BaseModel):
    """name is deliberately absent -- it's locked after creation (see
    CustomerOnboardingWizardPage and CustomerFormPage on the frontend).
    code (civil ID / registration number) is present but one-directional:
    CustomerCRUD.update rejects trying to change it once already set --
    this only exists so a prospective customer's code (NULL at creation,
    see CustomerCreate) can be filled in later once they provide it.
    Every other field, including customer_type and nature_of_business, is
    editable at any time. customer_number and the id_verified/id_document
    fields are also absent -- customer_number is system-generated, and
    id_verified/id_document_filename change only via the dedicated
    endpoints in api/customers.py (verify-id, id-document), never a plain
    field edit."""

    model_config = ConfigDict(str_strip_whitespace=True)

    code: str | None = Field(default=None, max_length=30)
    customer_type: str | None = Field(default=None, pattern="^(individual|business)$")
    nature_of_business: str | None = Field(default=None, max_length=150)
    contact_person: str | None = Field(default=None, max_length=120)
    email: EmailStr | None = Field(default=None, max_length=120)
    phone: str | None = Field(default=None, max_length=30)
    billing_address: str | None = Field(default=None, max_length=255)
    shipping_address: str | None = Field(default=None, max_length=255)
    city: str | None = Field(default=None, max_length=80)
    country: str | None = Field(default=None, max_length=80)
    credit_limit: float | None = Field(default=None, ge=0)
    payment_terms_days: int | None = Field(default=None, ge=0)
    status: str | None = Field(default=None, pattern="^(active|inactive)$")
    notes: str | None = Field(default=None, max_length=5000)


class CustomerOut(BaseModel):
    id: int
    customer_number: str
    customer_type: str
    code: str | None
    name: str
    nature_of_business: str | None
    contact_person: str | None
    email: str | None
    phone: str | None
    billing_address: str | None
    shipping_address: str | None
    city: str | None
    country: str | None
    credit_limit: float
    payment_terms_days: int
    status: str
    onboarding_status: str
    onboarding_reason: str | None
    notes: str | None
    id_document_filename: str | None
    id_verified: bool
    id_verified_at: datetime | None
    id_verified_by: int | None

    model_config = {"from_attributes": True}


class CustomerOnboardingStatusUpdate(BaseModel):
    status: str = Field(pattern="^(pending|under_review|active|on_hold|rejected)$")
    reason: str | None = None
