from datetime import date, datetime

from pydantic import BaseModel


class JourneyFeasibility(BaseModel):
    id: int
    feasibility_number: str
    status: str
    required_by_date: date | None
    created_at: datetime
    checked_at: datetime | None


class JourneyQuotation(BaseModel):
    id: int
    quotation_number: str
    status: str
    quotation_date: date
    total_amount: float
    created_at: datetime


class JourneyOrder(BaseModel):
    id: int
    order_number: str
    status: str
    order_date: date
    requested_delivery_date: date | None
    confirmed_delivery_date: date | None
    total_amount: float
    customer_name: str | None
    admin_review_required: bool
    created_at: datetime


class JourneyProductionBatch(BaseModel):
    id: int
    batch_number: str
    status: str
    product_name: str | None
    machine_name: str | None
    planned_quantity: float
    produced_quantity: float
    scheduled_start: date
    scheduled_end: date
    created_at: datetime
    actual_start: datetime | None
    actual_end: datetime | None


class JourneyDeliveryNote(BaseModel):
    id: int
    delivery_note_number: str
    status: str
    delivery_date: date
    created_at: datetime


class OrderJourneyOut(BaseModel):
    order: JourneyOrder
    feasibility: JourneyFeasibility | None
    quotation: JourneyQuotation | None
    production_batches: list[JourneyProductionBatch]
    delivery_notes: list[JourneyDeliveryNote]
