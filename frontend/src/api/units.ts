import type { PagedResponse, ListQueryParams, MessageResponse } from '@/types/common'
import type { UnitOfMeasure, UnitOfMeasureCreatePayload, UnitOfMeasureUpdatePayload } from '@/types/unitOfMeasure'
import { apiClient } from './client'

export async function listUnits(params: ListQueryParams): Promise<PagedResponse<UnitOfMeasure>> {
  const { data } = await apiClient.get<PagedResponse<UnitOfMeasure>>('/api/units', { params })
  return data
}

export async function createUnit(payload: UnitOfMeasureCreatePayload): Promise<UnitOfMeasure> {
  const { data } = await apiClient.post<UnitOfMeasure>('/api/units', payload)
  return data
}

export async function updateUnit(id: number, payload: UnitOfMeasureUpdatePayload): Promise<UnitOfMeasure> {
  const { data } = await apiClient.put<UnitOfMeasure>(`/api/units/${id}`, payload)
  return data
}

export async function deleteUnit(id: number): Promise<MessageResponse> {
  const { data } = await apiClient.delete<MessageResponse>(`/api/units/${id}`)
  return data
}
