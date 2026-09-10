from datetime import datetime

from pydantic import BaseModel, Field

ALTERNATIVE_STATUS_PATTERN = "^(approved|blocked)$"


class RawMaterialAlternativeIn(BaseModel):
    alternative_material_id: int
    priority: int = Field(default=1, ge=1)
    status: str = Field(default="approved", pattern=ALTERNATIVE_STATUS_PATTERN)
    conversion_ratio: float = Field(default=1, gt=0)
    notes: str | None = Field(default=None, max_length=255)


class RawMaterialAlternativeUpdate(BaseModel):
    """alternative_material_id is immutable once a relationship exists --
    delete and re-add to point the relationship at a different material."""

    priority: int | None = Field(default=None, ge=1)
    status: str | None = Field(default=None, pattern=ALTERNATIVE_STATUS_PATTERN)
    conversion_ratio: float | None = Field(default=None, gt=0)
    notes: str | None = Field(default=None, max_length=255)


class RawMaterialAlternativeOut(BaseModel):
    id: int
    raw_material_id: int
    alternative_material_id: int
    alternative_code: str | None = None
    alternative_name: str | None = None
    alternative_unit: str | None = None
    priority: int
    status: str
    conversion_ratio: float
    notes: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
