from pydantic import BaseModel, Field


class ProductCreate(BaseModel):
    code: str = Field(min_length=1, max_length=30)
    name: str = Field(min_length=1, max_length=150)
    unit: str = Field(min_length=1, max_length=20)
    product_type: str = Field(default="finished_good", pattern="^(finished_good|sub_assembly)$")
    selling_price: float = 0
    # "Formula" inputs for the feasibility check's time-required calculation.
    machine_id: int | None = None
    production_hours_per_unit: float | None = Field(default=None, ge=0)
    status: str = Field(default="active", pattern="^(active|inactive)$")


class ProductUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=150)
    unit: str | None = Field(default=None, min_length=1, max_length=20)
    product_type: str | None = Field(default=None, pattern="^(finished_good|sub_assembly)$")
    selling_price: float | None = None
    machine_id: int | None = None
    production_hours_per_unit: float | None = Field(default=None, ge=0)
    status: str | None = Field(default=None, pattern="^(active|inactive)$")


class ProductOut(BaseModel):
    id: int
    code: str
    name: str
    unit: str
    product_type: str
    selling_price: float
    machine_id: int | None
    production_hours_per_unit: float | None
    status: str

    model_config = {"from_attributes": True}
