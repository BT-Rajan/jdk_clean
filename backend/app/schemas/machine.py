from pydantic import BaseModel, Field


class MachineCreate(BaseModel):
    code: str = Field(min_length=1, max_length=30)
    name: str = Field(min_length=1, max_length=150)
    capacity_hours_per_day: float = Field(default=8, gt=0)
    status: str = Field(default="active", pattern="^(active|inactive)$")


class MachineUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=150)
    capacity_hours_per_day: float | None = Field(default=None, gt=0)
    status: str | None = Field(default=None, pattern="^(active|inactive)$")


class MachineOut(BaseModel):
    id: int
    code: str
    name: str
    capacity_hours_per_day: float
    status: str

    model_config = {"from_attributes": True}
