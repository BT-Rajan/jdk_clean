import type { SalesDrilldownResult, SalesReport } from '@/types/reports'
import { apiClient } from './client'

export async function getSalesReport(months = 12): Promise<SalesReport> {
  const { data } = await apiClient.get<SalesReport>('/api/reports/sales', { params: { months } })
  return data
}

export interface SalesDrilldownParams {
  year?: number
  month?: number
  status?: string
  customer_id?: number
  product_id?: number
}

export async function getSalesDrilldown(params: SalesDrilldownParams): Promise<SalesDrilldownResult> {
  const { data } = await apiClient.get<SalesDrilldownResult>('/api/reports/sales/drilldown', { params })
  return data
}
