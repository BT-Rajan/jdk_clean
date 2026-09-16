from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class MaterialRequirementItemOut(BaseModel):
    id: int
    raw_material_id: int
    code: str
    name: str
    unit: str
    # Mirrors RawMaterial.material_type (raw_material/packaging/consumable)
    # -- the existing classification, not a new taxonomy.
    material_type: str
    material_type_label: str
    # Which existing calculation produced this row -- 'bom' (bom_service.
    # explode_requirements_detailed) or 'packaging' (product_packaging_lines).
    source: str
    bom_id: int | None
    bom_number: str | None
    required_quantity: float
    # Computed live from inventory_service.get_stock, not stored --
    # see production_order_material_service.get_requirement_summary.
    available_quantity: float
    # Persisted -- this app's own record of how much of the shared
    # inventory reservation belongs to this Production Order (P4).
    allocated_quantity: float
    remaining_to_allocate: float
    shortage_quantity: float


class MaterialRequirementSummaryOut(BaseModel):
    production_order_id: int
    # 'not_calculated' (no rows yet), 'available' (every row's shortage
    # is 0), or 'short' (at least one row is short). Independent of
    # allocation_status below -- this is about whether enough stock
    # exists at all, not whether any of it has been committed yet.
    overall_status: str
    # 'not_calculated', 'not_allocated' (nothing allocated on any row),
    # 'partially_allocated', or 'fully_allocated' (every row's remaining
    # is 0). A material-readiness signal, not a replacement for the
    # Production Order's own PLANNED/CANCELLED status (see P2).
    allocation_status: str
    calculated_at: datetime | None
    items: list[MaterialRequirementItemOut]


class MaterialAllocationRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    quantity: float = Field(gt=0)
