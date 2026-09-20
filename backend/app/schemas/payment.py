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
    acknowledged_at: datetime | None = None
    acknowledged_by_name: str | None = None

    model_config = {"from_attributes": True}

    @staticmethod
    def from_model(obj) -> "PaymentOut":
        data = PaymentOut.model_validate(obj)
        data.order_number = obj.order.order_number if obj.order else None
        data.customer_name = obj.customer.name if obj.customer else None
        data.recorded_by_name = obj.creator.full_name if getattr(obj, "creator", None) else None
        data.acknowledged_by_name = obj.acknowledger.full_name if getattr(obj, "acknowledger", None) else None
        return data


class CustomerCreditStatusOut(BaseModel):
    customer_id: int
    credit_limit: float
    # 0 means "no limit configured/enforced" -- see payment_service.py.
    limit_enforced: bool
    outstanding_balance: float
    available_credit: float | None = None
    id_verified: bool = False


class OrderPaymentStatusOut(BaseModel):
    """Total/paid/acknowledged/outstanding for one order, plus its
    automatically-derived due date, overdue days, and current
    production-gate state -- see payment_service.get_order_payment_status."""

    order_id: int
    total_amount: float
    amount_paid: float
    amount_acknowledged: float
    outstanding_balance: float
    due_date: date
    overdue_days: int
    has_credit_facility: bool
    production_block_reason: str | None = None
    payment_override_at: datetime | None = None
    payment_override_reason: str | None = None
    payment_followup_owner_id: int | None = None
    payment_followup_owner_name: str | None = None
    payment_followup_date: date | None = None


class CollectionQueueRowOut(OrderPaymentStatusOut):
    order_number: str
    customer_id: int
    customer_name: str


class PaymentOverrideIn(BaseModel):
    reason: str = Field(min_length=1)


class PaymentFollowupIn(BaseModel):
    owner_id: int | None = None
    followup_date: date | None = None
