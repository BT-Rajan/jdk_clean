from pydantic import BaseModel

READINESS_STATUSES = (
    "READY",
    "MATERIAL_SHORTAGE",
    "MACHINE_CONFLICT",
    "WORKER_SHORTAGE",
    "MULTIPLE_ISSUES",
    "NO_ACTIVE_BOM",
)


class ReadinessAlternativeOut(BaseModel):
    """One approved alternative for a short material -- shown, never
    auto-applied (see raw_material_alternatives / Approved Alternatives
    on the Raw Material Master). Selecting one is an explicit user
    action recorded against the batch's actual consumption; the BOM
    itself is never touched."""

    raw_material_id: int
    code: str
    name: str
    unit: str
    conversion_ratio: float
    priority: int
    status: str
    on_hand: float
    available: float


class ReadinessProcurementOut(BaseModel):
    """Purchasing information only -- never a purchase order. Answering
    "what should we buy" stays MRP's job; this just surfaces what's
    already on file in the Raw Material Master for a short material."""

    supplier_id: int
    supplier_code: str
    supplier_name: str
    is_preferred: bool
    purchase_price: float
    currency: str
    moq: float
    lead_time_days: int | None


class ReadinessMaterialOut(BaseModel):
    raw_material_id: int
    code: str
    name: str
    unit: str
    required: float
    on_hand: float
    reserved: float
    available: float
    shortage: float
    safety_stock: float
    # True when (available - required) would fall below safety_stock --
    # a warning only, never a block (see ReadinessResult.status).
    safety_stock_warning: bool
    alternatives: list[ReadinessAlternativeOut] = []
    procurement: ReadinessProcurementOut | None = None


class ReadinessMachineOut(BaseModel):
    machine_id: int
    machine_code: str
    machine_name: str
    required_hours: float
    available_hours: float
    ok: bool


class ReadinessWorkersOut(BaseModel):
    workers_required: int
    required_hours: float
    available_hours: float
    ok: bool


class ReadinessResult(BaseModel):
    status: str  # one of READINESS_STATUSES
    product_id: int
    quantity: float
    bom_id: int | None = None
    bom_number: str | None = None
    output_quantity: float | None = None
    materials: list[ReadinessMaterialOut] = []
    machine: ReadinessMachineOut | None = None
    workers: ReadinessWorkersOut | None = None
    # Short, batch-agnostic explanation of exactly why status isn't
    # READY -- e.g. "2 materials short, machine time short by 4h" --
    # for the "show the exact reason" requirement without the caller
    # having to re-derive it from the structured fields above.
    summary: str
