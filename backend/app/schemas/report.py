from datetime import date, datetime

from pydantic import BaseModel


class SalesReportMonthly(BaseModel):
    year: int
    month: int
    label: str
    order_count: int
    revenue: float
    quotation_count: int


class SalesReportStatus(BaseModel):
    status: str
    count: int
    revenue: float


class SalesReportTopCustomer(BaseModel):
    customer_id: int
    customer_name: str
    revenue: float
    order_count: int


class SalesReportTopProduct(BaseModel):
    product_id: int
    code: str
    name: str
    revenue: float
    quantity: float


class QuotationConversion(BaseModel):
    total_quotations: int
    converted_quotations: int
    conversion_rate: float


class SalesReportOut(BaseModel):
    generated_at: datetime
    range_start: date
    range_end: date
    monthly: list[SalesReportMonthly]
    by_status: list[SalesReportStatus]
    top_customers: list[SalesReportTopCustomer]
    top_products: list[SalesReportTopProduct]
    quotation_conversion: QuotationConversion


class SalesDrilldownOrder(BaseModel):
    id: int
    order_number: str
    customer_name: str | None
    order_date: date
    status: str
    total_amount: float


class SalesDrilldownOut(BaseModel):
    items: list[SalesDrilldownOrder]
    total_count: int
