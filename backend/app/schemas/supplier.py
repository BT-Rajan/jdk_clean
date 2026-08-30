from pydantic import BaseModel, EmailStr, Field

MODE_OF_SUPPLY_PATTERN = "^(direct|distributor|broker|import)$"
STATUS_PATTERN = "^(active|inactive|suspended)$"


class SupplierCreate(BaseModel):
    code: str = Field(min_length=1, max_length=30)
    name: str = Field(min_length=1, max_length=150)
    contact_person: str | None = None
    email: EmailStr | None = None
    phone: str | None = None
    address: str | None = None
    city: str | None = None
    country: str | None = None
    payment_terms_days: int = 30
    mode_of_supply: str | None = Field(default=None, pattern=MODE_OF_SUPPLY_PATTERN)
    rating: int | None = Field(default=None, ge=1, le=5)
    status: str = Field(default="active", pattern=STATUS_PATTERN)


class SupplierUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=150)
    contact_person: str | None = None
    email: EmailStr | None = None
    phone: str | None = None
    address: str | None = None
    city: str | None = None
    country: str | None = None
    payment_terms_days: int | None = None
    mode_of_supply: str | None = Field(default=None, pattern=MODE_OF_SUPPLY_PATTERN)
    rating: int | None = Field(default=None, ge=1, le=5)
    status: str | None = Field(default=None, pattern=STATUS_PATTERN)


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
    mode_of_supply: str | None
    rating: int | None
    status: str

    model_config = {"from_attributes": True}
