import type { PagedResponse, ListQueryParams, MessageResponse } from '@/types/common'
import type { MaterialConflict, Quotation, QuotationPayload, SettableQuotationStatus } from '@/types/quotation'
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

export async function approveQuotation(id: number): Promise<Quotation> {
  const { data } = await apiClient.post<Quotation>(`/api/quotations/${id}/approve`)
  return data
}

/** Live pre-check: whether these lines' material needs, combined with
 * every other still-open quotation's own needs, would claim more of a
 * raw material than is actually available. Used by the New/Edit
 * quotation form to warn before submit -- creating/editing itself
 * re-checks and gates on the same logic server-side. */
export async function checkMaterialConflicts(
  lines: { product_id: number; quantity: number }[],
  excludeQuotationId?: number,
): Promise<MaterialConflict[]> {
  const { data } = await apiClient.post<MaterialConflict[]>('/api/quotations/material-conflicts', {
    lines,
    exclude_quotation_id: excludeQuotationId,
  })
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

export async function updateQuotationStatus(id: number, status: SettableQuotationStatus, reason?: string): Promise<Quotation> {
  const { data } = await apiClient.post<Quotation>(`/api/quotations/${id}/status`, { status, reason })
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

/** Triggers a browser download of the quotation as a .docx, rendered
 * from whichever template is active for that language -- see
 * Admin -> Documents -> Document Templates. */
export async function downloadQuotationDocx(id: number, quotationNumber: string, language: 'en' | 'ar'): Promise<void> {
  const response = await apiClient.get(`/api/quotations/${id}/docx`, { params: { language }, responseType: 'blob' })
  const url = window.URL.createObjectURL(new Blob([response.data]))
  const link = document.createElement('a')
  link.href = url
  link.download = `${quotationNumber}_${language}.docx`
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}

/** Sends the quotation PDF as an email attachment. */
export async function emailQuotation(id: number, toEmail: string, message?: string): Promise<MessageResponse> {
  const { data } = await apiClient.post<MessageResponse>(`/api/quotations/${id}/email`, {
    to_email: toEmail,
    message: message || undefined,
  })
  return data
}
