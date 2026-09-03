import type { PagedResponse, MessageResponse } from '@/types/common'
import type { Feasibility, FeasibilityPayload } from '@/types/feasibility'
import { apiClient } from './client'

export interface ListFeasibilitiesParams {
  page?: number
  page_size?: number
  search?: string
  status?: string
  customer_id?: number
  sort?: string
}

export async function listFeasibilities(params: ListFeasibilitiesParams): Promise<PagedResponse<Feasibility>> {
  const { data } = await apiClient.get<PagedResponse<Feasibility>>('/api/feasibility', { params })
  return data
}

export async function listAvailableForQuotation(params?: { customer_id?: number }): Promise<Feasibility[]> {
  const { data } = await apiClient.get<Feasibility[]>('/api/feasibility/available/for-quotation', { params })
  return data
}

export async function getFeasibility(id: number): Promise<Feasibility> {
  const { data } = await apiClient.get<Feasibility>(`/api/feasibility/${id}`)
  return data
}

export async function createFeasibility(payload: FeasibilityPayload): Promise<Feasibility> {
  const { data } = await apiClient.post<Feasibility>('/api/feasibility', payload)
  return data
}

export async function runFeasibilityCheck(id: number): Promise<Feasibility> {
  const { data } = await apiClient.post<Feasibility>(`/api/feasibility/${id}/run`)
  return data
}

export async function closeFeasibility(id: number, reason: string): Promise<Feasibility> {
  const { data } = await apiClient.post<Feasibility>(`/api/feasibility/${id}/close`, { reason })
  return data
}

export async function decideFeasibilityException(id: number, approve: boolean, reason: string): Promise<Feasibility> {
  const { data } = await apiClient.post<Feasibility>(`/api/feasibility/${id}/exception`, { approve, reason })
  return data
}

export async function adminReviewFeasibility(id: number, notes: string): Promise<Feasibility> {
  const { data } = await apiClient.post<Feasibility>(`/api/feasibility/${id}/admin-review`, { notes })
  return data
}

export async function adminDecideFeasibilityOverride(id: number, approve: boolean, notes: string): Promise<Feasibility> {
  const { data } = await apiClient.post<Feasibility>(`/api/feasibility/${id}/admin-decision`, { approve, notes })
  return data
}

export async function deleteFeasibility(id: number): Promise<MessageResponse> {
  const { data } = await apiClient.delete<MessageResponse>(`/api/feasibility/${id}`)
  return data
}

export async function restoreFeasibility(id: number): Promise<Feasibility> {
  const { data } = await apiClient.post<Feasibility>(`/api/feasibility/${id}/restore`)
  return data
}

export async function reviveFeasibility(id: number): Promise<Feasibility> {
  const { data } = await apiClient.post<Feasibility>(`/api/feasibility/${id}/revive`)
  return data
}

/** Triggers a browser download of the feasibility check as a .docx,
 * rendered from whichever template is active for that language -- see
 * Admin -> Documents -> Document Templates. */
export async function downloadFeasibilityDocx(id: number, feasibilityNumber: string, language: 'en' | 'ar'): Promise<void> {
  const response = await apiClient.get(`/api/feasibility/${id}/docx`, { params: { language }, responseType: 'blob' })
  const url = window.URL.createObjectURL(new Blob([response.data]))
  const link = document.createElement('a')
  link.href = url
  link.download = `${feasibilityNumber}_${language}.docx`
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}
