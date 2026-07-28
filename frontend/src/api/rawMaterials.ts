import type { PagedResponse, ListQueryParams, MessageResponse } from '@/types/common'
import type { RawMaterial, RawMaterialPayload } from '@/types/rawMaterial'
import { apiClient } from './client'

export async function listRawMaterials(params: ListQueryParams): Promise<PagedResponse<RawMaterial>> {
  const { data } = await apiClient.get<PagedResponse<RawMaterial>>('/api/raw-materials', { params })
  return data
}

export async function getRawMaterial(id: number): Promise<RawMaterial> {
  const { data } = await apiClient.get<RawMaterial>(`/api/raw-materials/${id}`)
  return data
}

export async function createRawMaterial(payload: RawMaterialPayload): Promise<RawMaterial> {
  const { data } = await apiClient.post<RawMaterial>('/api/raw-materials', payload)
  return data
}

export async function updateRawMaterial(id: number, payload: Partial<RawMaterialPayload>): Promise<RawMaterial> {
  const { data } = await apiClient.put<RawMaterial>(`/api/raw-materials/${id}`, payload)
  return data
}

export async function deleteRawMaterial(id: number): Promise<MessageResponse> {
  const { data } = await apiClient.delete<MessageResponse>(`/api/raw-materials/${id}`)
  return data
}

export async function restoreRawMaterial(id: number): Promise<RawMaterial> {
  const { data } = await apiClient.post<RawMaterial>(`/api/raw-materials/${id}/restore`)
  return data
}
