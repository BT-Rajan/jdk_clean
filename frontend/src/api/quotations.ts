import type { PagedResponse, ListQueryParams, MessageResponse } from '@/types/common'
import type { Quotation, QuotationPayload, SettableQuotationStatus } from '@/types/quotation'
import type { Order } from '@/types/order'
import { apiClient } from './client'

export interface QuotationListParams extends ListQueryParams {
  customer_id?: number
}

export async function listQuotations(params: QuotationListParams): Promise<PagedResponse<Quotation>> {
  const { data } = await apiClient.get<PagedResponse<Quotation>>('/api/quotations', { params })
  return data
}

export async function getQuotation(id: number): Promise<Quotation> {
  const { data } = await apiClient.get<Quotation>(`/api/quotations/${id}`)
  return data
}

export async function createQuotation(payload: QuotationPayload): Promise<Quotation> {
  const { data } = await apiClient.post<Quotation>('/api/quotations', payload)
  return data
}

export async function updateQuotation(id: number, payload: Partial<QuotationPayload>): Promise<Quotation> {
  const { data } = await apiClient.put<Quotation>(`/api/quotations/${id}`, payload)
  return data
}

export async function updateQuotationStatus(id: number, status: SettableQuotationStatus): Promise<Quotation> {
  const { data } = await apiClient.post<Quotation>(`/api/quotations/${id}/status`, { status })
  return data
}

export async function deleteQuotation(id: number): Promise<MessageResponse> {
  const { data } = await apiClient.delete<MessageResponse>(`/api/quotations/${id}`)
  return data
}

export async function restoreQuotation(id: number): Promise<Quotation> {
  const { data } = await apiClient.post<Quotation>(`/api/quotations/${id}/restore`)
  return data
}

export async function convertQuotationToOrder(id: number): Promise<Order> {
  const { data } = await apiClient.post<Order>(`/api/orders/from-quotation/${id}`)
  return data
}

/** Triggers a browser download of the quotation PDF via a Blob response. */
export async function downloadQuotationPdf(id: number, quotationNumber: string): Promise<void> {
  const response = await apiClient.get(`/api/quotations/${id}/pdf`, { responseType: 'blob' })
  const url = window.URL.createObjectURL(new Blob([response.data]))
  const link = document.createElement('a')
  link.href = url
  link.download = `${quotationNumber}.pdf`
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}
