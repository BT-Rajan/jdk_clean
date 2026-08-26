from pydantic import BaseModel, Field


class UnitOfMeasureCreate(BaseModel):
    code: str = Field(min_length=1, max_length=20)
    name: str = Field(min_length=1, max_length=60)
    category: str = Field(pattern="^(weight|count|volume)$")
    factor_to_base: float = Field(gt=0)
    is_base: bool = False
    status: str = Field(default="active", pattern="^(active|inactive)$")


class UnitOfMeasureUpdate(BaseModel):
    # code and category are intentionally not editable: changing either
    # after other rows (BOM lines, raw materials) already reference this
    # unit's code would silently reinterpret their stored quantities.
    # Deactivate and create a replacement instead.
    name: str | None = Field(default=None, min_length=1, max_length=60)
    factor_to_base: float | None = Field(default=None, gt=0)
    is_base: bool | None = None
    status: str | None = Field(default=None, pattern="^(active|inactive)$")


class UnitOfMeasureOut(BaseModel):
    id: int
    code: str
    name: str
    category: str
    factor_to_base: float
    is_base: bool
    status: str

    model_config = {"from_attributes": True}
