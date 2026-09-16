import type { PagedResponse, ListQueryParams } from '@/types/common'
import type { ProductionOrder, ProductionOrderPayload, SettableProductionOrderStatus } from '@/types/productionOrder'
import type { MaterialRequirementSummary } from '@/types/materialRequirement'
import { apiClient } from './client'

export interface ProductionOrderListParams extends ListQueryParams {
  order_id?: number
  order_detail_id?: number
  product_id?: number
}

export async function listProductionOrders(
  params: ProductionOrderListParams,
): Promise<PagedResponse<ProductionOrder>> {
  const { data } = await apiClient.get<PagedResponse<ProductionOrder>>('/api/production-orders', { params })
  return data
}

export async function getProductionOrder(id: number): Promise<ProductionOrder> {
  const { data } = await apiClient.get<ProductionOrder>(`/api/production-orders/${id}`)
  return data
}

export async function createProductionOrder(payload: ProductionOrderPayload): Promise<ProductionOrder> {
  const { data } = await apiClient.post<ProductionOrder>('/api/production-orders', payload)
  return data
}

export async function updateProductionOrderStatus(
  id: number,
  status: SettableProductionOrderStatus,
  reason?: string,
): Promise<ProductionOrder> {
  const { data } = await apiClient.post<ProductionOrder>(`/api/production-orders/${id}/status`, { status, reason })
  return data
}

export async function getMaterialRequirements(productionOrderId: number): Promise<MaterialRequirementSummary> {
  const { data } = await apiClient.get<MaterialRequirementSummary>(
    `/api/production-orders/${productionOrderId}/material-requirements`,
  )
  return data
}

/** Recalculates from the product's current active BOM/packaging --
 * idempotent, safe to call repeatedly. Only allowed while the
 * production order is still 'planned' (see
 * backend/app/services/production_order_material_service.py). */
export async function calculateMaterialRequirements(productionOrderId: number): Promise<MaterialRequirementSummary> {
  const { data } = await apiClient.post<MaterialRequirementSummary>(
    `/api/production-orders/${productionOrderId}/material-requirements/calculate`,
  )
  return data
}
