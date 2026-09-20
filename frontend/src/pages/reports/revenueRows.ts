import type { SalesReportTopCustomer, SalesReportTopProduct } from '@/types/reports'

/** How many rows the Top customers / Top products bars show. */
export const TOP_N = 8

export interface RevenueRow<T> {
  name: string
  title: string
  revenue: number
  source: T
}

export function customerRevenueRows(customers: SalesReportTopCustomer[] | undefined): RevenueRow<SalesReportTopCustomer>[] {
  return (customers ?? []).slice(0, TOP_N).map((c) => ({
    name: c.customer_name,
    title: c.customer_name,
    revenue: c.revenue,
    source: c,
  }))
}

export function productRevenueRows(products: SalesReportTopProduct[] | undefined): RevenueRow<SalesReportTopProduct>[] {
  return (products ?? []).slice(0, TOP_N).map((p) => ({
    name: p.name,
    title: `${p.name} (${p.code})`,
    revenue: p.revenue,
    source: p,
  }))
}
