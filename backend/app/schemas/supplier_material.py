from datetime import date, datetime

from pydantic import BaseModel, Field, field_validator, model_validator

SUPPLIER_MATERIAL_STATUS_PATTERN = "^(active|inactive)$"


def _normalize_currency(v: str) -> str:
    return v.strip().upper()


def _check_moq_within_capacity(moq: float | None, max_supply_quantity: float | None) -> None:
    if moq and max_supply_quantity and moq > max_supply_quantity:
        raise ValueError("MOQ cannot exceed the maximum supply quantity.")


class SupplierMaterialIn(BaseModel):
    """onboarded_at/last_transaction_at are deliberately absent -- both
    are auto-captured (see supplier_material_service.SupplierMaterialCRUD.
    replace_lines), never part of what the client sends."""

    raw_material_id: int
    supplier_material_code: str | None = Field(default=None, max_length=60)
    purchase_price: float = Field(default=0, ge=0)
    currency: str = Field(default="KWD", min_length=3, max_length=3)
    max_supply_quantity: float = Field(gt=0)
    lead_time_days: int | None = Field(default=None, ge=0)
    moq: float = Field(default=0, ge=0)
    is_preferred: bool = False
    status: str = Field(default="active", pattern=SUPPLIER_MATERIAL_STATUS_PATTERN)

    @field_validator("currency")
    @classmethod
    def _currency_upper(cls, v: str) -> str:
        return _normalize_currency(v)

    @model_validator(mode="after")
    def _check_moq(self):
        _check_moq_within_capacity(self.moq, self.max_supply_quantity)
        return self


class SupplierMaterialOut(BaseModel):
    id: int
    supplier_id: int
    raw_material_id: int
    supplier_code: str | None = None
    supplier_name: str | None = None
    material_code: str | None = None
    material_name: str | None = None
    material_unit: str | None = None
    supplier_material_code: str | None
    purchase_price: float
    currency: str
    max_supply_quantity: float
    lead_time_days: int | None
    moq: float
    is_preferred: bool
    status: str
    onboarded_at: date
    last_transaction_at: date | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class SupplierMaterialsReplace(BaseModel):
    """Full replace of a supplier's suppliable materials: send every line
    that should exist -- mirrors BomReplace's same pattern."""

    lines: list[SupplierMaterialIn]

    @field_validator("lines")
    @classmethod
    def _no_duplicate_materials(cls, v: list[SupplierMaterialIn]) -> list[SupplierMaterialIn]:
        seen = set()
        for line in v:
            if line.raw_material_id in seen:
                raise ValueError(
                    f"Duplicate raw material in supplier's material list: #{line.raw_material_id}. "
                    "Combine into a single line instead."
                )
            seen.add(line.raw_material_id)
        return v


class SupplierMaterialForMaterialIn(BaseModel):
    """Adding one supplier to a raw material from the material's own
    Procurement/Suppliers panel -- the mirror image of SupplierMaterialIn,
    which adds one material to a supplier. raw_material_id is implied by
    the URL, so this carries supplier_id instead."""

    supplier_id: int
    supplier_material_code: str | None = Field(default=None, max_length=60)
    purchase_price: float = Field(default=0, ge=0)
    currency: str = Field(default="KWD", min_length=3, max_length=3)
    max_supply_quantity: float = Field(gt=0)
    lead_time_days: int | None = Field(default=None, ge=0)
    moq: float = Field(default=0, ge=0)
    is_preferred: bool = False
    status: str = Field(default="active", pattern=SUPPLIER_MATERIAL_STATUS_PATTERN)

    @field_validator("currency")
    @classmethod
    def _currency_upper(cls, v: str) -> str:
        return _normalize_currency(v)

    @model_validator(mode="after")
    def _check_moq(self):
        _check_moq_within_capacity(self.moq, self.max_supply_quantity)
        return self


class SupplierMaterialLineUpdate(BaseModel):
    """Patches one existing supplier-material line in place -- used by
    both the supplier-side and material-side single-line endpoints.
    supplier_id/raw_material_id are immutable once a line exists (delete
    and re-add to change either)."""

    supplier_material_code: str | None = Field(default=None, max_length=60)
    purchase_price: float | None = Field(default=None, ge=0)
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    max_supply_quantity: float | None = Field(default=None, gt=0)
    lead_time_days: int | None = Field(default=None, ge=0)
    moq: float | None = Field(default=None, ge=0)
    is_preferred: bool | None = None
    status: str | None = Field(default=None, pattern=SUPPLIER_MATERIAL_STATUS_PATTERN)

    @field_validator("currency")
    @classmethod
    def _currency_upper(cls, v: str | None) -> str | None:
        return _normalize_currency(v) if v else v

    @model_validator(mode="after")
    def _check_moq(self):
        _check_moq_within_capacity(self.moq, self.max_supply_quantity)
        return self
