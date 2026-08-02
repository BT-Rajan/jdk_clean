from pydantic import BaseModel, Field


class PermissionEntry(BaseModel):
    department: str
    page_key: str
    access_level: str = Field(pattern="^(none|read|write)$")


class PermissionMatrixUpdate(BaseModel):
    entries: list[PermissionEntry]
