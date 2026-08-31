from pydantic import BaseModel, Field


class PermissionEntry(BaseModel):
    department_id: int
    # Display convenience only -- always ignored on write, always
    # populated by permission_service.get_matrix on read.
    department_code: str | None = None
    page_key: str
    access_level: str = Field(pattern="^(none|read|write)$")


class PermissionMatrixUpdate(BaseModel):
    entries: list[PermissionEntry]


class PermissionPage(BaseModel):
    key: str
    label: str
