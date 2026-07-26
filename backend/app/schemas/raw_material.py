from pydantic import BaseModel, Field


class RawMaterialCreate(BaseModel):
    code: str = Field(min_length=1, max_length=30)
    name: str = Field(min_length=1, max_length=150)
    unit: str = Field(min_length=1, max_length=20)
    reorder_point: float = 0
    default_supplier_id: int | None = None
    unit_cost: float = 0
    status: str = Field(default="active", pattern="^(active|inactive)$")


class RawMaterialUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=150)
    unit: str | None = Field(default=None, min_length=1, max_length=20)
    reorder_point: float | None = None
    default_supplier_id: int | None = None
    unit_cost: float | None = None
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
