from datetime import date, datetime

from pydantic import BaseModel, Field, field_validator

from app.core.validators import not_in_past


class PaymentPlanCreate(BaseModel):
    amount: float = Field(gt=0)
    target_date: date
    notes: str | None = None

    @field_validator("target_date")
    @classmethod
    def _not_past(cls, v: date) -> date:
        return not_in_past(v)


class PaymentPlanOut(BaseModel):
    id: int
    order_id: int
    order_number: str | None = None
    customer_id: int
    customer_name: str | None = None
    amount: float
    target_date: date
    notes: str | None
    created_at: datetime
    recorded_by_name: str | None = None

    model_config = {"from_attributes": True}

    @staticmethod
    def from_model(obj) -> "PaymentPlanOut":
        data = PaymentPlanOut.model_validate(obj)
        data.order_number = obj.order.order_number if obj.order else None
        data.customer_name = obj.customer.name if obj.customer else None
        data.recorded_by_name = obj.creator.full_name if getattr(obj, "creator", None) else None
        return data
