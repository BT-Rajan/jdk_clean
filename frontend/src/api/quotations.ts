import type { PagedResponse, ListQueryParams, MessageResponse } from '@/types/common'
import type { MaterialConflict, Quotation, QuotationPayload, SettableQuotationStatus } from '@/types/quotation'
import type { Order } from '@/types/order'
import { apiClient } from './client'

export interface QuotationListParams extends ListQueryParams {
  customer_id?: number
  feasibility_id?: number
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

/** Records the manually-entered link to an external payment system --
 * only settable while 'accepted', and required before
 * convertQuotationToOrder will convert this quotation at all. */
export async function setQuotationPaymentLink(id: number, paymentLink: string): Promise<Quotation> {
  const { data } = await apiClient.post<Quotation>(`/api/quotations/${id}/payment-link`, { payment_link: paymentLink })
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

/** The one-click "Follow up" action -- logs that Sales just followed up
 * with this customer and schedules the next one. Omit nextFollowupDate
 * for a true one click (defaults server-side to today + 3 days). */
export async function recordQuotationFollowup(id: number, nextFollowupDate?: string): Promise<Quotation> {
  const { data } = await apiClient.post<Quotation>(`/api/quotations/${id}/follow-up`, {
    next_followup_date: nextFollowupDate || undefined,
  })
  return data
}

/** Explicitly extends an expired quotation's validity and reopens it to
 * 'sent' -- the deliberate way past the block on emailing an expired
 * quotation. Omit validUntil to default to today + 7 days. */
export async function renewQuotation(id: number, validUntil?: string): Promise<Quotation> {
  const { data } = await apiClient.post<Quotation>(`/api/quotations/${id}/renew`, {
    valid_until: validUntil || undefined,
  })
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

/** The subject/body "Send email" would use right now (first-send vs.
 * already-sent-before template, whichever the admin has configured),
 * for the compose dialog to preview before anything is sent. */
export async function getQuotationEmailPreview(id: number): Promise<{ to_email: string | null; subject: string; body: string }> {
  const { data } = await apiClient.get(`/api/quotations/${id}/email-preview`)
  return data
}

/** Sends the quotation PDF as an email attachment. */
export async function emailQuotation(id: number, toEmail: string, message?: string, attachPdf = true): Promise<MessageResponse> {
  const { data } = await apiClient.post<MessageResponse>(`/api/quotations/${id}/email`, {
    to_email: toEmail,
    message: message || undefined,
    attach_pdf: attachPdf,
  })
  return data
}
