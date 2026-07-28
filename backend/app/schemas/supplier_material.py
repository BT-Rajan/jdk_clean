from datetime import datetime

from pydantic import BaseModel, Field, field_validator


class SupplierMaterialIn(BaseModel):
    raw_material_id: int
    max_supply_quantity: float = Field(gt=0)
    lead_time_days: int | None = Field(default=None, ge=0)


class SupplierMaterialOut(BaseModel):
    id: int
    supplier_id: int
    raw_material_id: int
    material_code: str | None = None
    material_name: str | None = None
    material_unit: str | None = None
    max_supply_quantity: float
    lead_time_days: int | None
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
