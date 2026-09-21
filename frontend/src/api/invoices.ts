import { apiClient } from './client'
import type { PagedResponse, ListQueryParams } from '@/types/common'
import type { Invoice, InvoiceFull } from '@/types/invoice'

export async function listInvoices(params: ListQueryParams): Promise<PagedResponse<Invoice | InvoiceFull>> {
  const { data } = await apiClient.get<PagedResponse<Invoice | InvoiceFull>>('/api/invoices', { params })
  return data
}

export async function getInvoice(id: number): Promise<Invoice | InvoiceFull> {
  const { data } = await apiClient.get<Invoice | InvoiceFull>(`/api/invoices/${id}`)
  return data
}

/** Null if this order doesn't have an invoice yet (not yet confirmed). */
export async function getInvoiceByOrder(orderId: number): Promise<(Invoice | InvoiceFull) | null> {
  const { data } = await apiClient.get<(Invoice | InvoiceFull) | null>(`/api/invoices/by-order/${orderId}`)
  return data
}

/** Finance requesting (or regenerating) a MyFatoorah payment link + QR --
 * Sales never calls this. */
export async function generateInvoicePaymentLink(id: number): Promise<InvoiceFull> {
  const { data } = await apiClient.post<InvoiceFull>(`/api/invoices/${id}/generate-link`)
  return data
}

export async function voidInvoice(id: number, reason: string): Promise<InvoiceFull> {
  const { data } = await apiClient.post<InvoiceFull>(`/api/invoices/${id}/void`, { reason })
  return data
}

/** Triggers a browser download of the invoice PDF (with QR) via a Blob response. */
export async function downloadInvoicePdf(id: number, invoiceNumber: string): Promise<void> {
  const response = await apiClient.get(`/api/invoices/${id}/pdf`, { responseType: 'blob' })
  const url = window.URL.createObjectURL(new Blob([response.data]))
  const link = document.createElement('a')
  link.href = url
  link.download = `${invoiceNumber}.pdf`
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}
