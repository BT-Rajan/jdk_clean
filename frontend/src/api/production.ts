import type { PagedResponse, ListQueryParams, MessageResponse } from '@/types/common'
import type { ProductionBatch, ProductionBatchPayload, SettableProductionStatus } from '@/types/production'
import { apiClient } from './client'

export interface ProductionListParams extends ListQueryParams {
  product_id?: number
  order_id?: number
}

export async function listProductionBatches(
  params: ProductionListParams,
): Promise<PagedResponse<ProductionBatch>> {
  const { data } = await apiClient.get<PagedResponse<ProductionBatch>>('/api/production-schedules', {
    params,
  })
  return data
}

export async function getProductionBatch(id: number): Promise<ProductionBatch> {
  const { data } = await apiClient.get<ProductionBatch>(`/api/production-schedules/${id}`)
  return data
}

export async function createProductionBatch(payload: ProductionBatchPayload): Promise<ProductionBatch> {
  const { data } = await apiClient.post<ProductionBatch>('/api/production-schedules', payload)
  return data
}

export interface ProductionQuickLogPayload {
  product_id: number
  quantity: number
  notes?: string
}

/** Creates and completes a batch in one call, for production that's
 * already happened -- see backend/app/services/production_service.py's
 * log_production. */
export async function logProduction(payload: ProductionQuickLogPayload): Promise<ProductionBatch> {
  const { data } = await apiClient.post<ProductionBatch>('/api/production-schedules/log', payload)
  return data
}

export async function updateProductionBatch(
  id: number,
  payload: Partial<ProductionBatchPayload>,
): Promise<ProductionBatch> {
  const { data } = await apiClient.put<ProductionBatch>(`/api/production-schedules/${id}`, payload)
  return data
}

export async function updateProductionBatchStatus(
  id: number,
  status: SettableProductionStatus,
  producedQuantity?: number,
  reason?: string,
): Promise<ProductionBatch> {
  const { data } = await apiClient.post<ProductionBatch>(`/api/production-schedules/${id}/status`, {
    status,
    produced_quantity: producedQuantity,
    reason,
  })
  return data
}

export async function deleteProductionBatch(id: number): Promise<MessageResponse> {
  const { data } = await apiClient.delete<MessageResponse>(`/api/production-schedules/${id}`)
  return data
}

export async function restoreProductionBatch(id: number): Promise<ProductionBatch> {
  const { data } = await apiClient.post<ProductionBatch>(`/api/production-schedules/${id}/restore`)
  return data
}
