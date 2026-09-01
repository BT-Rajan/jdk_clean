import type { PagedResponse, ListQueryParams, MessageResponse } from '@/types/common'
import type { SupplierReturn, SupplierReturnPayload } from '@/types/supplierReturn'
import { apiClient } from './client'

export interface SupplierReturnListParams extends ListQueryParams {
  supplier_id?: number
}

export async function listSupplierReturns(
  params: SupplierReturnListParams,
): Promise<PagedResponse<SupplierReturn>> {
  const { data } = await apiClient.get<PagedResponse<SupplierReturn>>('/api/supplier-returns', { params })
  return data
}

export async function getSupplierReturn(id: number): Promise<SupplierReturn> {
  const { data } = await apiClient.get<SupplierReturn>(`/api/supplier-returns/${id}`)
  return data
}

export async function createSupplierReturn(payload: SupplierReturnPayload): Promise<SupplierReturn> {
  const { data } = await apiClient.post<SupplierReturn>('/api/supplier-returns', payload)
  return data
}

export async function deleteSupplierReturn(id: number): Promise<MessageResponse> {
  const { data } = await apiClient.delete<MessageResponse>(`/api/supplier-returns/${id}`)
  return data
}
