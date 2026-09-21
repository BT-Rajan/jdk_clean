from datetime import datetime

from pydantic import BaseModel, Field


class InvoiceVoidIn(BaseModel):
    reason: str = Field(min_length=1, max_length=2000)


class InvoiceStatusOut(BaseModel):
    """What Sales (a scoped salesman or the Sales Manager) may see: the
    invoice exists and where it stands, never the payment link, QR, or
    MyFatoorah reference -- those are Finance's to edit, not Sales' to even
    read (see the "Sales -> Finance Invoice Handoff" design doc, gap 7).
    """

    id: int
    invoice_number: str
    order_id: int
    order_number: str | None = None
    quotation_id: int | None
    quotation_number: str | None = None
    customer_id: int
    customer_name: str | None = None
    status: str
    # Not columns on Invoice itself (order total / SUM of acknowledged
    # payments) -- left at their default here so model_validate(obj) can
    # build the rest of the object straight off the ORM row, then
    # from_model below fills these in from what the caller already
    # computed (see OrderOut.from_model's own precomputed-extras pattern
    # -- schemas don't reach into services themselves).
    total_amount: float = 0.0
    amount_acknowledged: float = 0.0
    voided_reason: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @staticmethod
    def from_model(obj, amount_acknowledged: float = 0.0) -> "InvoiceStatusOut":
        data = InvoiceStatusOut.model_validate(obj)
        data.order_number = obj.order.order_number if obj.order else None
        data.quotation_number = obj.quotation.quotation_number if obj.quotation else None
        data.customer_name = obj.customer.name if obj.customer else None
        data.total_amount = float(obj.order.total_amount) if obj.order else 0.0
        data.amount_acknowledged = amount_acknowledged
        return data


class InvoiceOut(InvoiceStatusOut):
    """Finance's full view -- adds the payment link, QR, and MyFatoorah
    reference that InvoiceStatusOut deliberately withholds."""

    version: int
    payment_link_url: str | None
    payment_link_ref: str | None
    payment_link_expires_at: datetime | None
    qr_data_url: str | None
    voided_at: datetime | None
    voided_by: int | None

    @staticmethod
    def from_model(obj, amount_acknowledged: float = 0.0) -> "InvoiceOut":
        data = InvoiceOut.model_validate(obj)
        data.order_number = obj.order.order_number if obj.order else None
        data.quotation_number = obj.quotation.quotation_number if obj.quotation else None
        data.customer_name = obj.customer.name if obj.customer else None
        data.total_amount = float(obj.order.total_amount) if obj.order else 0.0
        data.amount_acknowledged = amount_acknowledged
        return data
