from datetime import datetime

from pydantic import BaseModel


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
    shortage_quantity: float


class MaterialRequirementSummaryOut(BaseModel):
    production_order_id: int
    # 'not_calculated' (no rows yet), 'available' (every row's shortage
    # is 0), or 'short' (at least one row is short).
    overall_status: str
    calculated_at: datetime | None
    items: list[MaterialRequirementItemOut]
