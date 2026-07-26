from datetime import datetime

from pydantic import BaseModel, Field, field_validator


class BomLineIn(BaseModel):
    component_type: str = Field(pattern="^(raw_material|product)$")
    component_id: int
    quantity: float = Field(gt=0)
    unit: str = Field(min_length=1, max_length=20)
    scrap_percent: float = Field(default=0, ge=0, le=100)


class BomLineOut(BaseModel):
    id: int
    parent_product_id: int
    component_type: str
    component_id: int
    component_code: str | None = None
    component_name: str | None = None
    quantity: float
    unit: str
    scrap_percent: float
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class BomReplace(BaseModel):
    """Full replace of a product's BOM: send every line that should exist."""

    lines: list[BomLineIn]

    @field_validator("lines")
    @classmethod
    def _no_duplicate_components(cls, v: list[BomLineIn]) -> list[BomLineIn]:
        seen = set()
        for line in v:
            key = (line.component_type, line.component_id)
            if key in seen:
                raise ValueError(
                    f"Duplicate component in BOM: {line.component_type} #{line.component_id}. "
                    "Combine into a single line instead."
                )
            seen.add(key)
        return v


class RequirementLine(BaseModel):
    """One row of an exploded BOM: how much of this raw material is needed
    in total (across every level of the tree) to build the requested
    quantity of the root product."""

    raw_material_id: int
    code: str | None = None
    name: str | None = None
    unit: str | None = None
    quantity_required: float


class BomExplosionResult(BaseModel):
    product_id: int
    quantity_requested: float
    requirements: list[RequirementLine]
