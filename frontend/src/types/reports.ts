/** Mirrors backend/app/schemas/report.py. Read-only -- no create/update shapes. */

export interface SalesReportMonthly {
  year: number
  month: number
  label: string
  order_count: number
  revenue: number
  quotation_count: number
}

export interface SalesReportStatus {
  status: string
  count: number
  revenue: number
}

export interface SalesReportTopCustomer {
  customer_id: number
  customer_name: string
  revenue: number
  order_count: number
}

export interface SalesReportTopProduct {
  product_id: number
  code: string
  name: string
  revenue: number
  quantity: number
}

export interface QuotationConversion {
  total_quotations: number
  converted_quotations: number
  conversion_rate: number
}

export interface SalesReport {
  generated_at: string
  range_start: string
  range_end: string
  monthly: SalesReportMonthly[]
  by_status: SalesReportStatus[]
  top_customers: SalesReportTopCustomer[]
  top_products: SalesReportTopProduct[]
  quotation_conversion: QuotationConversion
}

export interface SalesDrilldownOrder {
  id: number
  order_number: string
  customer_name: string | null
  order_date: string
  status: string
  total_amount: number
}

export interface SalesDrilldownResult {
  items: SalesDrilldownOrder[]
  total_count: number
}

export interface ProductionReportMonthly {
  year: number
  month: number
  label: string
  batch_count: number
  planned_quantity: number
  produced_quantity: number
}

export interface ProductionReportStatus {
  status: string
  count: number
  planned_quantity: number
}

export interface ProductionReportTopProduct {
  product_id: number
  code: string
  name: string
  batch_count: number
  produced_quantity: number
}

export interface ProductionReport {
  generated_at: string
  range_start: string
  range_end: string
  monthly: ProductionReportMonthly[]
  by_status: ProductionReportStatus[]
  top_products: ProductionReportTopProduct[]
  material_discrepancy_count: number
}

export interface ProductionDrilldownBatch {
  id: number
  batch_number: string
  product_name: string | null
  scheduled_start: string
  status: string
  planned_quantity: number
  produced_quantity: number
}

export interface ProductionDrilldownResult {
  items: ProductionDrilldownBatch[]
  total_count: number
}

export interface PurchasingReportMonthly {
  year: number
  month: number
  label: string
  po_count: number
  spend: number
}

export interface PurchasingReportStatus {
  status: string
  count: number
  spend: number
}

export interface PurchasingReportTopSupplier {
  supplier_id: number
  supplier_name: string
  spend: number
  po_count: number
}

export interface PurchasingReportTopMaterial {
  raw_material_id: number
  code: string
  name: string
  spend: number
  quantity: number
}

export interface PurchasingReport {
  generated_at: string
  range_start: string
  range_end: string
  monthly: PurchasingReportMonthly[]
  by_status: PurchasingReportStatus[]
  top_suppliers: PurchasingReportTopSupplier[]
  top_materials: PurchasingReportTopMaterial[]
}

export interface PurchasingDrilldownOrder {
  id: number
  po_number: string
  supplier_name: string | null
  order_date: string
  status: string
  total_amount: number
}

export interface PurchasingDrilldownResult {
  items: PurchasingDrilldownOrder[]
  total_count: number
}

export interface InventoryReportMonthly {
  year: number
  month: number
  label: string
  inbound: number
  outbound: number
  production: number
}

export interface InventoryReportMovementType {
  movement_type: string
  count: number
  quantity: number
}

export interface InventoryReportTopItem {
  item_type: string
  item_id: number
  code: string
  name: string
  quantity: number
}

export interface InventoryReport {
  generated_at: string
  range_start: string
  range_end: string
  raw_material_value: number
  finished_goods_value: number
  low_stock_count: number
  monthly: InventoryReportMonthly[]
  by_movement_type: InventoryReportMovementType[]
  top_items: InventoryReportTopItem[]
}

export interface InventoryDrilldownMovement {
  id: number
  item_type: string
  item_name: string | null
  item_route: string | null
  movement_type: string
  quantity: number
  created_at: string
  notes: string | null
}

export interface InventoryDrilldownResult {
  items: InventoryDrilldownMovement[]
  total_count: number
}
