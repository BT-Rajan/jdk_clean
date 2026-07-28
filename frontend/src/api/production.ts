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
): Promise<ProductionBatch> {
  const { data } = await apiClient.post<ProductionBatch>(`/api/production-schedules/${id}/status`, {
    status,
    produced_quantity: producedQuantity,
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
