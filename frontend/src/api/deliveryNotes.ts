import type { PagedResponse, ListQueryParams, MessageResponse } from '@/types/common'
import type {
  DeliveryNote,
  DeliveryNoteCreatePayload,
  DeliveryNoteUpdatePayload,
  SettableDeliveryNoteStatus,
} from '@/types/deliveryNote'
import { apiClient } from './client'

export interface DeliveryNoteListParams extends ListQueryParams {
  order_id?: number
}

export async function listDeliveryNotes(
  params: DeliveryNoteListParams,
): Promise<PagedResponse<DeliveryNote>> {
  const { data } = await apiClient.get<PagedResponse<DeliveryNote>>('/api/delivery-notes', { params })
  return data
}

export async function getDeliveryNote(id: number): Promise<DeliveryNote> {
  const { data } = await apiClient.get<DeliveryNote>(`/api/delivery-notes/${id}`)
  return data
}

export async function createDeliveryNote(payload: DeliveryNoteCreatePayload): Promise<DeliveryNote> {
  const { data } = await apiClient.post<DeliveryNote>('/api/delivery-notes', payload)
  return data
}

export async function updateDeliveryNote(
  id: number,
  payload: DeliveryNoteUpdatePayload,
): Promise<DeliveryNote> {
  const { data } = await apiClient.put<DeliveryNote>(`/api/delivery-notes/${id}`, payload)
  return data
}

export async function updateDeliveryNoteStatus(
  id: number,
  status: SettableDeliveryNoteStatus,
  reason?: string,
): Promise<DeliveryNote> {
  const { data } = await apiClient.post<DeliveryNote>(`/api/delivery-notes/${id}/status`, { status, reason })
  return data
}

export async function deleteDeliveryNote(id: number): Promise<MessageResponse> {
  const { data } = await apiClient.delete<MessageResponse>(`/api/delivery-notes/${id}`)
  return data
}

export async function restoreDeliveryNote(id: number): Promise<DeliveryNote> {
  const { data } = await apiClient.post<DeliveryNote>(`/api/delivery-notes/${id}/restore`)
  return data
}

/** Triggers a browser download of the delivery note PDF via a Blob response. */
export async function downloadDeliveryNotePdf(id: number, noteNumber: string): Promise<void> {
  const response = await apiClient.get(`/api/delivery-notes/${id}/pdf`, { responseType: 'blob' })
  const url = window.URL.createObjectURL(new Blob([response.data]))
  const link = document.createElement('a')
  link.href = url
  link.download = `${noteNumber}.pdf`
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}

/** Sends the delivery note PDF as an email attachment. */
export async function emailDeliveryNote(id: number, toEmail: string, message?: string): Promise<MessageResponse> {
  const { data } = await apiClient.post<MessageResponse>(`/api/delivery-notes/${id}/email`, {
    to_email: toEmail,
    message: message || undefined,
  })
  return data
}
