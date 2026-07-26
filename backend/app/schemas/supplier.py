from pydantic import BaseModel, EmailStr, Field


class SupplierCreate(BaseModel):
    code: str = Field(min_length=1, max_length=30)
    name: str = Field(min_length=1, max_length=150)
    contact_person: str | None = None
    email: EmailStr | None = None
    phone: str | None = None
    address: str | None = None
    city: str | None = None
    country: str | None = None
    tax_id: str | None = None
    payment_terms_days: int = 30
    status: str = Field(default="active", pattern="^(active|inactive)$")


class SupplierUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=150)
    contact_person: str | None = None
    email: EmailStr | None = None
    phone: str | None = None
    address: str | None = None
    city: str | None = None
    country: str | None = None
    tax_id: str | None = None
    payment_terms_days: int | None = None
    status: str | None = Field(default=None, pattern="^(active|inactive)$")


class SupplierOut(BaseModel):
    id: int
    code: str
    name: str
    contact_person: str | None
    email: str | None
    phone: str | None
    city: str | None
    country: str | None
    payment_terms_days: int
    status: str

    model_config = {"from_attributes": True}
