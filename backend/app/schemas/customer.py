from pydantic import BaseModel, EmailStr, Field


class CustomerCreate(BaseModel):
    code: str = Field(min_length=1, max_length=30)
    name: str = Field(min_length=1, max_length=150)
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
    name: str | None = Field(default=None, min_length=1, max_length=150)
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
    code: str
    name: str
    contact_person: str | None
    email: str | None
    phone: str | None
    city: str | None
    country: str | None
    credit_limit: float
    payment_terms_days: int
    status: str

    model_config = {"from_attributes": True}
