from datetime import date, datetime

from pydantic import BaseModel


class MrpSuggestedPurchase(BaseModel):
    supplier_id: int
    supplier_code: str
    supplier_name: str
    quantity: float
    lead_time_days: int | None
    mode_of_supply: str | None


class MrpIncomingPurchaseOrder(BaseModel):
    """One still-open purchase order line already covering some of a
    material's requirement -- see mrp_service._open_incoming_by_material."""

    purchase_order_id: int
    po_number: str
    supplier_name: str | None
    quantity: float
    expected_delivery_date: date | None
    status: str


class MrpSource(BaseModel):
    """One demand source contributing to a material's total_required --
    a scheduled production run (legacy or Production-Order-driven) or an
    outstanding customer order line with no batch scheduled yet. See
    mrp_service._demand_sources."""

    source_type: str  # 'production_order' | 'legacy_batch' | 'order'
    schedule_id: int | None
    batch_number: str | None
    production_order_id: int | None
    production_order_number: str | None
    order_id: int | None
    order_number: str | None
    product_id: int
    product_name: str | None
    required_quantity: float
    required_by_date: date | None
    # True when this source's own required_by_date falls before the
    # material's expected_available_date (or that date can't be
    # projected at all) -- this shortage risks making it miss its date.
    at_risk: bool


class MrpRequirementLine(BaseModel):
    raw_material_id: int
    code: str
    name: str
    unit: str
    reorder_point: float
    total_required: float
    # On-hand stock net of existing reservations/allocations (e.g.
    # Production Order material allocations) -- not raw on-hand, so this
    # never overstates what's actually free to cover this requirement.
    available_quantity: float
    confirmed_incoming_quantity: float
    incoming_purchase_orders: list[MrpIncomingPurchaseOrder]
    # required - available - confirmed incoming, clamped at 0 -- not
    # simply required minus on-hand stock.
    shortfall: float
    uncovered_quantity: float
    fully_covered: bool
    # True when shortfall is 0 purely because confirmed incoming stock
    # already closes the gap -- nothing new to suggest for this material.
    fully_covered_by_incoming: bool
    date_known: bool
    expected_available_date: date | None
    suggested_purchases: list[MrpSuggestedPurchase]
    sources: list[MrpSource]


class MrpSourceGroupMaterial(BaseModel):
    raw_material_id: int
    code: str
    name: str
    unit: str
    required_quantity: float
    shortfall: float
    fully_covered: bool


class MrpSourceGroup(BaseModel):
    """One production order / legacy batch / order line and every
    material it's still short on -- see mrp_service.group_by_source."""

    source_type: str
    id: int | None
    label: str | None
    product_id: int
    product_name: str | None
    required_by_date: date | None
    at_risk: bool
    materials: list[MrpSourceGroupMaterial]


class MrpReport(BaseModel):
    generated_at: datetime
    items: list[MrpRequirementLine]
    by_source: list[MrpSourceGroup]
