from datetime import datetime

from pydantic import BaseModel, EmailStr, Field

MODE_OF_SUPPLY_PATTERN = "^(direct|distributor|broker|import)$"
STATUS_PATTERN = "^(active|inactive|suspended)$"


class SupplierCreate(BaseModel):
    """code is deliberately absent -- SupplierCRUD.create generates it via
    number_series (doc_type 'SUPPLIER'), the same way order_number/
    quotation_number/etc. are generated, rather than being typed in on
    the wizard."""

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
    onboarding_status: str
    onboarding_reason: str | None
    id_document_filename: str | None
    id_verified: bool
    id_verified_at: datetime | None
    id_verified_by: int | None

    model_config = {"from_attributes": True}


class SupplierOnboardingStatusUpdate(BaseModel):
    """See app/models/supplier.py SUPPLIER_ONBOARDING_STATUSES. reason is
    required by the service layer when status is 'rejected' or 'on_hold'
    (assert_reason_given)."""

    status: str = Field(pattern="^(pending|under_review|active|on_hold|rejected)$")
    reason: str | None = None
