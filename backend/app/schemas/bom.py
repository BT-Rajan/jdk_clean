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
    # Set only for component_type == 'raw_material' -- the Raw Material
    # Master's own classification (raw_material/packaging/consumable),
    # so the BOM table can show it without duplicating it as BOM data.
    component_material_type: str | None = None
    # Live stock snapshot for the component (raw materials only) -- read
    # straight from inventory, never stored here. None for a product
    # (sub-assembly) component, which has no meaningful single "on hand"
    # figure the same way (see inventory_service.get_stock's item_type).
    component_on_hand: float | None = None
    quantity: float
    unit: str
    scrap_percent: float
    # quantity inflated by scrap_percent -- the actual amount this line
    # consumes per output_quantity batch. Computed once here (see
    # bom_service._resolve_labels) so every caller (this table, Production,
    # MRP) reads the identical figure instead of each recomputing it.
    effective_quantity: float
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


BOM_HEADER_STATUS_PATTERN = "^(active|inactive)$"


class BomHeaderCreate(BaseModel):
    output_quantity: float = Field(default=1, gt=0)
    notes: str | None = Field(default=None, max_length=500)


class BomHeaderUpdate(BaseModel):
    output_quantity: float | None = Field(default=None, gt=0)
    status: str | None = Field(default=None, pattern=BOM_HEADER_STATUS_PATTERN)
    notes: str | None = Field(default=None, max_length=500)


class BomHeaderOut(BaseModel):
    id: int
    bom_number: str
    product_id: int
    output_quantity: float
    status: str
    notes: str | None
    component_count: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
