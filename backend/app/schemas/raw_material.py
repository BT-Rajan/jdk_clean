from pydantic import BaseModel, ConfigDict, Field


class RawMaterialCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    code: str = Field(min_length=1, max_length=30)
    name: str = Field(min_length=1, max_length=150)
    unit: str = Field(min_length=1, max_length=20)
    reorder_point: float = Field(default=0, ge=0)
    default_supplier_id: int | None = Field(default=None, gt=0)
    unit_cost: float = Field(default=0, ge=0)
    status: str = Field(default="active", pattern="^(active|inactive)$")


class RawMaterialUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str | None = Field(default=None, min_length=1, max_length=150)
    unit: str | None = Field(default=None, min_length=1, max_length=20)
    reorder_point: float | None = Field(default=None, ge=0)
    default_supplier_id: int | None = Field(default=None, gt=0)
    unit_cost: float | None = Field(default=None, ge=0)
    status: str | None = Field(default=None, pattern="^(active|inactive)$")


class RawMaterialOut(BaseModel):
    id: int
    code: str
    name: str
    unit: str
    reorder_point: float
    default_supplier_id: int | None
    unit_cost: float
    status: str

    model_config = {"from_attributes": True}
