from datetime import datetime

from pydantic import BaseModel


class DealFeasibilityRef(BaseModel):
    id: int
    feasibility_number: str
    status: str


class DealQuotationRef(BaseModel):
    id: int
    quotation_number: str
    status: str
    total_amount: float
    auto_created: bool


class DealOrderRef(BaseModel):
    id: int
    order_number: str
    status: str
    total_amount: float


class DealBatchRef(BaseModel):
    id: int
    batch_number: str
    status: str
    product_name: str | None


class DealDeliveryRef(BaseModel):
    id: int
    delivery_note_number: str
    status: str


class DealDetailOut(BaseModel):
    id: int
    deal_number: str
    customer_id: int
    customer_name: str | None
    furthest_stage: str
    status: str
    created_at: datetime
    feasibility_checks: list[DealFeasibilityRef]
    quotations: list[DealQuotationRef]
    orders: list[DealOrderRef]
    production_batches: list[DealBatchRef]
    delivery_notes: list[DealDeliveryRef]
