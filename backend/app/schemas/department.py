from pydantic import BaseModel, Field


class DepartmentCreate(BaseModel):
    code: str = Field(min_length=1, max_length=30)
    name: str = Field(min_length=1, max_length=80)
    status: str = Field(default="active", pattern="^(active|inactive)$")


class DepartmentUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    status: str | None = Field(default=None, pattern="^(active|inactive)$")


class DepartmentOut(BaseModel):
    id: int
    code: str
    name: str
    status: str

    model_config = {"from_attributes": True}
