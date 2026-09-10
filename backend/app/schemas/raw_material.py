from pydantic import BaseModel, ConfigDict, Field, model_validator

STATUS_PATTERN = "^(active|inactive|blocked)$"
MATERIAL_TYPE_PATTERN = "^(raw_material|packaging|consumable)$"


def _check_stock_thresholds(maximum_stock: float, reorder_point: float, safety_stock: float) -> None:
    # Only enforced once a maximum is actually set -- 0 (the default)
    # means "no ceiling configured yet", not "cap stock at zero".
    if maximum_stock <= 0:
        return
    if safety_stock > maximum_stock:
        raise ValueError("Safety stock cannot exceed maximum stock.")
    if reorder_point > maximum_stock:
        raise ValueError("Reorder point cannot exceed maximum stock.")


class RawMaterialCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    code: str = Field(min_length=1, max_length=30)
    name: str = Field(min_length=1, max_length=150)
    unit: str = Field(min_length=1, max_length=20)
    material_type: str = Field(default="raw_material", pattern=MATERIAL_TYPE_PATTERN)
    category: str | None = Field(default=None, max_length=100)
    description: str | None = None
    properties: dict[str, str] | None = None
    manufacturer: str | None = Field(default=None, max_length=150)
    manufacturer_part_number: str | None = Field(default=None, max_length=100)

    reorder_point: float = Field(default=0, ge=0)
    safety_stock: float = Field(default=0, ge=0)
    maximum_stock: float = Field(default=0, ge=0)
    storage_location: str | None = Field(default=None, max_length=100)

    default_supplier_id: int | None = Field(default=None, gt=0)
    unit_cost: float = Field(default=0, ge=0)

    inspection_required: bool = False
    certificate_required: bool = False
    qc_notes: str | None = None

    status: str = Field(default="active", pattern=STATUS_PATTERN)

    @model_validator(mode="after")
    def _check_stock_thresholds(self):
        _check_stock_thresholds(self.maximum_stock, self.reorder_point, self.safety_stock)
        return self


class RawMaterialUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str | None = Field(default=None, min_length=1, max_length=150)
    unit: str | None = Field(default=None, min_length=1, max_length=20)
    material_type: str | None = Field(default=None, pattern=MATERIAL_TYPE_PATTERN)
    category: str | None = Field(default=None, max_length=100)
    description: str | None = None
    properties: dict[str, str] | None = None
    manufacturer: str | None = Field(default=None, max_length=150)
    manufacturer_part_number: str | None = Field(default=None, max_length=100)

    reorder_point: float | None = Field(default=None, ge=0)
    safety_stock: float | None = Field(default=None, ge=0)
    maximum_stock: float | None = Field(default=None, ge=0)
    storage_location: str | None = Field(default=None, max_length=100)

    default_supplier_id: int | None = Field(default=None, gt=0)
    unit_cost: float | None = Field(default=None, ge=0)

    inspection_required: bool | None = None
    certificate_required: bool | None = None
    qc_notes: str | None = None

    status: str | None = Field(default=None, pattern=STATUS_PATTERN)

    # A partial update only has the thresholds actually being changed --
    # full cross-field checking (against whatever isn't in this payload)
    # happens in RawMaterialCRUD.update, which has the existing row to
    # fill the gaps from before checking. This validator only catches the
    # case where the payload itself is internally inconsistent.
    @model_validator(mode="after")
    def _check_stock_thresholds(self):
        if self.maximum_stock is not None and self.maximum_stock > 0:
            if self.safety_stock is not None and self.safety_stock > self.maximum_stock:
                raise ValueError("Safety stock cannot exceed maximum stock.")
            if self.reorder_point is not None and self.reorder_point > self.maximum_stock:
                raise ValueError("Reorder point cannot exceed maximum stock.")
        return self


class RawMaterialOut(BaseModel):
    id: int
    code: str
    name: str
    unit: str
    material_type: str
    category: str | None
    description: str | None
    properties: dict[str, str] | None
    manufacturer: str | None
    manufacturer_part_number: str | None

    reorder_point: float
    safety_stock: float
    maximum_stock: float
    storage_location: str | None

    default_supplier_id: int | None
    unit_cost: float

    inspection_required: bool
    certificate_required: bool
    qc_notes: str | None

    status: str

    model_config = {"from_attributes": True}
