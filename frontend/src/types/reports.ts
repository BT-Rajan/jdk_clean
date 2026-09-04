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
