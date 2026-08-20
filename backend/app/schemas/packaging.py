from datetime import datetime

from pydantic import BaseModel, Field, field_validator


class PackagingLineIn(BaseModel):
    packaging_material_id: int
    quantity_per_unit: float = Field(gt=0)
    unit: str = Field(min_length=1, max_length=20)


class PackagingLineOut(BaseModel):
    id: int
    product_id: int
    packaging_material_id: int
    packaging_material_code: str | None = None
    packaging_material_name: str | None = None
    quantity_per_unit: float
    unit: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PackagingReplace(BaseModel):
    """Full replace of a product's packaging list: send every line that
    should exist. Mirrors BomReplace."""

    lines: list[PackagingLineIn]

    @field_validator("lines")
    @classmethod
    def _no_duplicate_materials(cls, v: list[PackagingLineIn]) -> list[PackagingLineIn]:
        seen = set()
        for line in v:
            if line.packaging_material_id in seen:
                raise ValueError(
                    f"Duplicate packaging material #{line.packaging_material_id}. "
                    "Combine into a single line instead."
                )
            seen.add(line.packaging_material_id)
        return v
