from pydantic import BaseModel, Field


class ProductCreate(BaseModel):
    code: str = Field(min_length=1, max_length=30)
    name: str = Field(min_length=1, max_length=150)
    unit: str = Field(min_length=1, max_length=20)
    product_type: str = Field(default="finished_good", pattern="^(finished_good|sub_assembly)$")
    selling_price: float = 0
    # How production time is entered -- see Product model docstring.
    # production_hours_per_unit is derived from these when both are set
    # (app.crud.master_data.ProductCRUD); still accepted directly for a
    # product with no natural "batch" (kept for backward compatibility).
    batch_size: float | None = Field(default=None, gt=0)
    batch_production_hours: float | None = Field(default=None, ge=0)
    # "Formula" inputs for the feasibility check's time-required calculation.
    machine_id: int | None = None
    production_hours_per_unit: float | None = Field(default=None, ge=0)
    workers_required: int | None = Field(default=None, ge=0)
    status: str = Field(default="active", pattern="^(active|inactive)$")
    tags: list[str] | None = None
    properties: dict[str, str] | None = None
    reorder_point: float = Field(default=0, ge=0)


class ProductUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=150)
    unit: str | None = Field(default=None, min_length=1, max_length=20)
    product_type: str | None = Field(default=None, pattern="^(finished_good|sub_assembly)$")
    selling_price: float | None = None
    batch_size: float | None = Field(default=None, gt=0)
    batch_production_hours: float | None = Field(default=None, ge=0)
    machine_id: int | None = None
    production_hours_per_unit: float | None = Field(default=None, ge=0)
    workers_required: int | None = Field(default=None, ge=0)
    status: str | None = Field(default=None, pattern="^(active|inactive)$")
    tags: list[str] | None = None
    properties: dict[str, str] | None = None
    reorder_point: float | None = Field(default=None, ge=0)


class ProductOut(BaseModel):
    id: int
    code: str
    name: str
    unit: str
    product_type: str
    selling_price: float
    batch_size: float | None
    batch_production_hours: float | None
    machine_id: int | None
    production_hours_per_unit: float | None
    workers_required: int | None
    status: str
    tags: list[str] | None = None
    properties: dict[str, str] | None = None
    reorder_point: float

    model_config = {"from_attributes": True}


class ProductImportRow(BaseModel):
    """One row of a CSV import, after the frontend's column-mapping step
    has already turned raw CSV cells into named fields -- see
    api/products.py's /import endpoint.

    Deliberately unconstrained (every field optional, no patterns/ranges):
    this is only the request body's shape. The real validation -- code/
    name/unit required, product_type/status patterns, numeric ranges --
    happens per-row inside the endpoint's loop, by constructing
    ProductCreate/ProductUpdate from each row and catching the resulting
    ValidationError there. Putting those same constraints directly on
    this schema instead would mean FastAPI rejects the *entire* request
    body the moment any single row fails one of them, before the
    endpoint's per-row try/except ever runs -- defeating the point of a
    bulk importer that's supposed to report one bad row without losing
    the rest of the batch.
    """

    code: str | None = None
    name: str | None = None
    unit: str | None = None
    product_type: str | None = None
    selling_price: float | None = None
    batch_size: float | None = None
    batch_production_hours: float | None = None
    machine_id: int | None = None
    production_hours_per_unit: float | None = None
    workers_required: int | None = None
    status: str | None = None
    reorder_point: float | None = None


class ProductImportRequest(BaseModel):
    rows: list[ProductImportRow] = Field(min_length=1, max_length=1000)


class ProductImportRowResult(BaseModel):
    row: int
    code: str
    action: str  # "created" | "updated" | "error"
    message: str | None = None


class ProductImportResult(BaseModel):
    created: int
    updated: int
    errors: int
    results: list[ProductImportRowResult]
