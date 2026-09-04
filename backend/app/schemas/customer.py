from pydantic import BaseModel, EmailStr, Field


class CustomerCreate(BaseModel):
    customer_type: str = Field(pattern="^(individual|business)$")
    code: str = Field(min_length=1, max_length=30)
    name: str = Field(min_length=1, max_length=150)
    nature_of_business: str | None = None
    contact_person: str | None = None
    email: EmailStr | None = None
    phone: str | None = None
    billing_address: str | None = None
    shipping_address: str | None = None
    city: str | None = None
    country: str | None = None
    credit_limit: float = 0
    payment_terms_days: int = 30
    status: str = Field(default="active", pattern="^(active|inactive)$")
    notes: str | None = None


class CustomerUpdate(BaseModel):
    """name and code (civil ID / registration number) are deliberately
    absent -- they're locked after creation (see CustomerOnboardingWizardPage
    and CustomerFormPage on the frontend). Every other field, including
    customer_type and nature_of_business, is editable at any time."""

    customer_type: str | None = Field(default=None, pattern="^(individual|business)$")
    nature_of_business: str | None = None
    contact_person: str | None = None
    email: EmailStr | None = None
    phone: str | None = None
    billing_address: str | None = None
    shipping_address: str | None = None
    city: str | None = None
    country: str | None = None
    credit_limit: float | None = None
    payment_terms_days: int | None = None
    status: str | None = Field(default=None, pattern="^(active|inactive)$")
    notes: str | None = None


class CustomerOut(BaseModel):
    id: int
    customer_type: str
    code: str
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

    model_config = {"from_attributes": True}


class CustomerOnboardingStatusUpdate(BaseModel):
    status: str = Field(pattern="^(pending|under_review|active|on_hold|rejected)$")
    reason: str | None = None
