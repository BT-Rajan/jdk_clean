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


class ProductionReportMonthly(BaseModel):
    year: int
    month: int
    label: str
    batch_count: int
    planned_quantity: float
    produced_quantity: float


class ProductionReportStatus(BaseModel):
    status: str
    count: int
    planned_quantity: float


class ProductionReportTopProduct(BaseModel):
    product_id: int
    code: str
    name: str
    batch_count: int
    produced_quantity: float


class ProductionReportOut(BaseModel):
    generated_at: datetime
    range_start: date
    range_end: date
    monthly: list[ProductionReportMonthly]
    by_status: list[ProductionReportStatus]
    top_products: list[ProductionReportTopProduct]
    material_discrepancy_count: int


class ProductionDrilldownBatch(BaseModel):
    id: int
    batch_number: str
    product_name: str | None
    scheduled_start: date
    status: str
    planned_quantity: float
    produced_quantity: float


class ProductionDrilldownOut(BaseModel):
    items: list[ProductionDrilldownBatch]
    total_count: int


class PurchasingReportMonthly(BaseModel):
    year: int
    month: int
    label: str
    po_count: int
    spend: float


class PurchasingReportStatus(BaseModel):
    status: str
    count: int
    spend: float


class PurchasingReportTopSupplier(BaseModel):
    supplier_id: int
    supplier_name: str
    spend: float
    po_count: int


class PurchasingReportTopMaterial(BaseModel):
    raw_material_id: int
    code: str
    name: str
    spend: float
    quantity: float


class PurchasingReportOut(BaseModel):
    generated_at: datetime
    range_start: date
    range_end: date
    monthly: list[PurchasingReportMonthly]
    by_status: list[PurchasingReportStatus]
    top_suppliers: list[PurchasingReportTopSupplier]
    top_materials: list[PurchasingReportTopMaterial]


class PurchasingDrilldownOrder(BaseModel):
    id: int
    po_number: str
    supplier_name: str | None
    order_date: date
    status: str
    total_amount: float


class PurchasingDrilldownOut(BaseModel):
    items: list[PurchasingDrilldownOrder]
    total_count: int


class InventoryReportMonthly(BaseModel):
    year: int
    month: int
    label: str
    inbound: float
    outbound: float
    production: float


class InventoryReportMovementType(BaseModel):
    movement_type: str
    count: int
    quantity: float


class InventoryReportTopItem(BaseModel):
    item_type: str
    item_id: int
    code: str
    name: str
    quantity: float


class InventoryReportOut(BaseModel):
    generated_at: datetime
    range_start: date
    range_end: date
    raw_material_value: float
    finished_goods_value: float
    low_stock_count: int
    monthly: list[InventoryReportMonthly]
    by_movement_type: list[InventoryReportMovementType]
    top_items: list[InventoryReportTopItem]


class InventoryDrilldownMovement(BaseModel):
    id: int
    item_type: str
    item_name: str | None
    item_route: str | None
    movement_type: str
    quantity: float
    created_at: datetime
    notes: str | None


class InventoryDrilldownOut(BaseModel):
    items: list[InventoryDrilldownMovement]
    total_count: int
