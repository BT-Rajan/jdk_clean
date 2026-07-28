import type { PagedResponse, ListQueryParams, MessageResponse } from '@/types/common'
import type { Supplier, SupplierPayload } from '@/types/supplier'
import { apiClient } from './client'

export async function listSuppliers(params: ListQueryParams): Promise<PagedResponse<Supplier>> {
  const { data } = await apiClient.get<PagedResponse<Supplier>>('/api/suppliers', { params })
  return data
}

export async function getSupplier(id: number): Promise<Supplier> {
  const { data } = await apiClient.get<Supplier>(`/api/suppliers/${id}`)
  return data
}

export async function createSupplier(payload: SupplierPayload): Promise<Supplier> {
  const { data } = await apiClient.post<Supplier>('/api/suppliers', payload)
  return data
}

export async function updateSupplier(id: number, payload: Partial<SupplierPayload>): Promise<Supplier> {
  const { data } = await apiClient.put<Supplier>(`/api/suppliers/${id}`, payload)
  return data
}

export async function deleteSupplier(id: number): Promise<MessageResponse> {
  const { data } = await apiClient.delete<MessageResponse>(`/api/suppliers/${id}`)
  return data
}

export async function restoreSupplier(id: number): Promise<Supplier> {
  const { data } = await apiClient.post<Supplier>(`/api/suppliers/${id}/restore`)
  return data
}
