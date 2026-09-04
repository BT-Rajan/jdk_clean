import type { PagedResponse, ListQueryParams, MessageResponse } from '@/types/common'
import type { Supplier, SupplierOnboardingStatus, SupplierPayload } from '@/types/supplier'
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

export async function updateSupplierOnboardingStatus(
  id: number,
  status: SupplierOnboardingStatus,
  reason?: string,
): Promise<Supplier> {
  const { data } = await apiClient.post<Supplier>(`/api/suppliers/${id}/onboarding-status`, { status, reason })
  return data
}

export async function uploadSupplierIdDocument(id: number, file: File): Promise<Supplier> {
  const form = new FormData()
  form.append('file', file)
  // See api/auth.ts's uploadAvatar for why Content-Type must be cleared
  // here -- apiClient's default JSON header otherwise makes axios
  // JSON.stringify the FormData instead of sending it as multipart.
  const { data } = await apiClient.post<Supplier>(`/api/suppliers/${id}/id-document`, form, {
    headers: { 'Content-Type': undefined },
  })
  return data
}

export async function deleteSupplierIdDocument(id: number): Promise<Supplier> {
  const { data } = await apiClient.delete<Supplier>(`/api/suppliers/${id}/id-document`)
  return data
}

/** id-document is served behind auth, same as the avatar endpoint --
 * fetch it as a blob (the interceptor attaches the Authorization header)
 * rather than pointing an <img>/<a> straight at the API path. */
export async function fetchSupplierIdDocumentBlob(id: number): Promise<Blob> {
  const { data } = await apiClient.get(`/api/suppliers/${id}/id-document`, { responseType: 'blob' })
  return data
}

export async function verifySupplierId(id: number): Promise<Supplier> {
  const { data } = await apiClient.post<Supplier>(`/api/suppliers/${id}/verify-id`)
  return data
}

export async function unverifySupplierId(id: number): Promise<Supplier> {
  const { data } = await apiClient.post<Supplier>(`/api/suppliers/${id}/unverify-id`)
  return data
}
