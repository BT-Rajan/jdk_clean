import type {
  InventoryDrilldownResult,
  InventoryReport,
  ProductionDrilldownResult,
  ProductionReport,
  PurchasingDrilldownResult,
  PurchasingReport,
  SalesDrilldownResult,
  SalesReport,
} from '@/types/reports'
import { apiClient } from './client'

/** `months` is only used as a fallback default when neither date is set --
 * once the user picks a from/to date, that pair drives the report window
 * instead (dateTo can't be a future date; dateFrom can be any past date). */
export interface ReportRangeParams {
  months?: number
  dateFrom?: string
  dateTo?: string
}

function rangeQueryParams({ months = 12, dateFrom, dateTo }: ReportRangeParams) {
  return { months, date_from: dateFrom || undefined, date_to: dateTo || undefined }
}

export async function getSalesReport(range: ReportRangeParams = {}): Promise<SalesReport> {
  const { data } = await apiClient.get<SalesReport>('/api/reports/sales', { params: rangeQueryParams(range) })
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

export async function getProductionReport(range: ReportRangeParams = {}): Promise<ProductionReport> {
  const { data } = await apiClient.get<ProductionReport>('/api/reports/production', { params: rangeQueryParams(range) })
  return data
}

export interface ProductionDrilldownParams {
  year?: number
  month?: number
  status?: string
  product_id?: number
}

export async function getProductionDrilldown(params: ProductionDrilldownParams): Promise<ProductionDrilldownResult> {
  const { data } = await apiClient.get<ProductionDrilldownResult>('/api/reports/production/drilldown', { params })
  return data
}

export async function getPurchasingReport(range: ReportRangeParams = {}): Promise<PurchasingReport> {
  const { data } = await apiClient.get<PurchasingReport>('/api/reports/purchasing', { params: rangeQueryParams(range) })
  return data
}

export interface PurchasingDrilldownParams {
  year?: number
  month?: number
  status?: string
  supplier_id?: number
  raw_material_id?: number
}

export async function getPurchasingDrilldown(params: PurchasingDrilldownParams): Promise<PurchasingDrilldownResult> {
  const { data } = await apiClient.get<PurchasingDrilldownResult>('/api/reports/purchasing/drilldown', { params })
  return data
}

export async function getInventoryReport(range: ReportRangeParams = {}): Promise<InventoryReport> {
  const { data } = await apiClient.get<InventoryReport>('/api/reports/inventory', { params: rangeQueryParams(range) })
  return data
}

export interface InventoryDrilldownParams {
  year?: number
  month?: number
  movement_type?: string
  item_type?: string
  item_id?: number
}

export async function getInventoryDrilldown(params: InventoryDrilldownParams): Promise<InventoryDrilldownResult> {
  const { data } = await apiClient.get<InventoryDrilldownResult>('/api/reports/inventory/drilldown', { params })
  return data
}
