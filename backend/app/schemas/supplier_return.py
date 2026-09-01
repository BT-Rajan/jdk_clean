from datetime import date, datetime

from pydantic import BaseModel, Field, field_validator

from app.core.validators import not_in_future


class SupplierReturnLineIn(BaseModel):
    raw_material_id: int
    quantity: float = Field(gt=0)


class SupplierReturnLineOut(BaseModel):
    id: int
    raw_material_id: int
    material_code: str | None = None
    material_name: str | None = None
    unit: str | None = None
    quantity: float

    model_config = {"from_attributes": True}


class SupplierReturnCreate(BaseModel):
    supplier_id: int
    purchase_order_id: int | None = None
    return_date: date
    reason: str = Field(min_length=1)
    notes: str | None = None
    lines: list[SupplierReturnLineIn] = Field(min_length=1)

    @field_validator("return_date")
    @classmethod
    def _not_future(cls, v: date) -> date:
        return not_in_future(v)


class SupplierReturnOut(BaseModel):
    id: int
    return_number: str
    supplier_id: int
    supplier_code: str | None = None
    supplier_name: str | None = None
    purchase_order_id: int | None
    po_number: str | None = None
    return_date: date
    reason: str
    notes: str | None
    lines: list[SupplierReturnLineOut]
    created_at: datetime
    created_by_name: str | None = None

    model_config = {"from_attributes": True}

    @staticmethod
    def from_model(obj) -> "SupplierReturnOut":
        data = SupplierReturnOut.model_validate(obj)
        data.supplier_code = obj.supplier.code if obj.supplier else None
        data.supplier_name = obj.supplier.name if obj.supplier else None
        data.po_number = obj.purchase_order.po_number if obj.purchase_order else None
        data.created_by_name = obj.creator.full_name if obj.creator else None
        for line_out, line_obj in zip(data.lines, obj.lines, strict=True):
            line_out.material_code = line_obj.raw_material.code if line_obj.raw_material else None
            line_out.material_name = line_obj.raw_material.name if line_obj.raw_material else None
            line_out.unit = line_obj.raw_material.unit if line_obj.raw_material else None
        return data
