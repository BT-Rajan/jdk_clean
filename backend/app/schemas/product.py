from pydantic import BaseModel, ConfigDict, Field, model_validator

# Mirrors app/models/product.py's PRODUCT_UNITS.
UNIT_PATTERN = "^(kg|20kg|25kg|ton|ml|litre)$"


def _check_stock_thresholds(maximum_stock: float, reorder_point: float) -> None:
    # Mirrors raw_material.py's identical check (minus safety_stock,
    # which products don't have). Only enforced once a maximum is
    # actually set -- 0 (the default) means "no ceiling configured yet".
    if maximum_stock <= 0:
        return
    if reorder_point > maximum_stock:
        raise ValueError("Reorder point cannot exceed maximum stock.")


class ProductCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    code: str = Field(min_length=1, max_length=30)
    name: str = Field(min_length=1, max_length=150)
    unit: str = Field(pattern=UNIT_PATTERN)
    category: str | None = Field(default=None, max_length=100)
    description: str | None = None
    product_type: str = Field(default="finished_good", pattern="^(finished_good|sub_assembly)$")
    selling_price: float = Field(default=0, ge=0)
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
    maximum_stock: float = Field(default=0, ge=0)
    inspection_required: bool = False
    qc_notes: str | None = None

    @model_validator(mode="after")
    def _check_stock_thresholds(self):
        _check_stock_thresholds(self.maximum_stock, self.reorder_point)
        return self


class ProductUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str | None = Field(default=None, min_length=1, max_length=150)
    unit: str | None = Field(default=None, pattern=UNIT_PATTERN)
    category: str | None = Field(default=None, max_length=100)
    description: str | None = None
    product_type: str | None = Field(default=None, pattern="^(finished_good|sub_assembly)$")
    selling_price: float | None = Field(default=None, ge=0)
    batch_size: float | None = Field(default=None, gt=0)
    batch_production_hours: float | None = Field(default=None, ge=0)
    machine_id: int | None = None
    production_hours_per_unit: float | None = Field(default=None, ge=0)
    workers_required: int | None = Field(default=None, ge=0)
    status: str | None = Field(default=None, pattern="^(active|inactive)$")
    tags: list[str] | None = None
    properties: dict[str, str] | None = None
    reorder_point: float | None = Field(default=None, ge=0)
    maximum_stock: float | None = Field(default=None, ge=0)
    inspection_required: bool | None = None
    qc_notes: str | None = None

    # A partial update only cross-checks fields present in this same
    # payload -- the existing row fills the gaps (see
    # app.crud.master_data.ProductCRUD._check_stock_thresholds), same
    # convention as RawMaterialUpdate.
    @model_validator(mode="after")
    def _check_stock_thresholds(self):
        if self.maximum_stock is not None and self.maximum_stock > 0:
            if self.reorder_point is not None and self.reorder_point > self.maximum_stock:
                raise ValueError("Reorder point cannot exceed maximum stock.")
        return self


class ProductOut(BaseModel):
    id: int
    code: str
    name: str
    unit: str
    category: str | None
    description: str | None
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
    maximum_stock: float
    inspection_required: bool
    qc_notes: str | None

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
    maximum_stock: float | None = None


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
