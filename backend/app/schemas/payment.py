from datetime import date, datetime

from pydantic import BaseModel, Field, field_validator

from app.core.validators import not_in_future


class PaymentCreate(BaseModel):
    amount: float = Field(gt=0)
    payment_date: date
    method: str | None = None
    reference: str | None = None
    notes: str | None = None

    @field_validator("payment_date")
    @classmethod
    def _not_future(cls, v: date) -> date:
        return not_in_future(v)


class PaymentOut(BaseModel):
    id: int
    order_id: int
    order_number: str | None = None
    customer_id: int
    customer_name: str | None = None
    amount: float
    payment_date: date
    method: str | None
    reference: str | None
    notes: str | None
    created_at: datetime
    recorded_by_name: str | None = None

    model_config = {"from_attributes": True}

    @staticmethod
    def from_model(obj) -> "PaymentOut":
        data = PaymentOut.model_validate(obj)
        data.order_number = obj.order.order_number if obj.order else None
        data.customer_name = obj.customer.name if obj.customer else None
        data.recorded_by_name = obj.creator.full_name if getattr(obj, "creator", None) else None
        return data


class CustomerCreditStatusOut(BaseModel):
    customer_id: int
    credit_limit: float
    # 0 means "no limit configured/enforced" -- see payment_service.py.
    limit_enforced: bool
    outstanding_balance: float
    available_credit: float | None = None
    id_verified: bool = False
