import type { PagedResponse, ListQueryParams, MessageResponse } from '@/types/common'
import type { Machine, MachinePayload } from '@/types/machine'
import { apiClient } from './client'

export async function listMachines(params: ListQueryParams): Promise<PagedResponse<Machine>> {
  const { data } = await apiClient.get<PagedResponse<Machine>>('/api/machines', { params })
  return data
}

export async function getMachine(id: number): Promise<Machine> {
  const { data } = await apiClient.get<Machine>(`/api/machines/${id}`)
  return data
}

export async function createMachine(payload: MachinePayload): Promise<Machine> {
  const { data } = await apiClient.post<Machine>('/api/machines', payload)
  return data
}

export async function updateMachine(id: number, payload: Partial<MachinePayload>): Promise<Machine> {
  const { data } = await apiClient.put<Machine>(`/api/machines/${id}`, payload)
  return data
}

export async function deleteMachine(id: number): Promise<MessageResponse> {
  const { data } = await apiClient.delete<MessageResponse>(`/api/machines/${id}`)
  return data
}

export async function restoreMachine(id: number): Promise<Machine> {
  const { data } = await apiClient.post<Machine>(`/api/machines/${id}/restore`)
  return data
}
