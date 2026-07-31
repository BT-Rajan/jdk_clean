import type { PagedResponse, ListQueryParams, MessageResponse } from '@/types/common'
import type {
  PurchaseOrder,
  PurchaseOrderPayload,
  SettablePurchaseOrderStatus,
} from '@/types/purchaseOrder'
import { apiClient } from './client'

export interface PurchaseOrderListParams extends ListQueryParams {
  supplier_id?: number
}

export async function listPurchaseOrders(
  params: PurchaseOrderListParams,
): Promise<PagedResponse<PurchaseOrder>> {
  const { data } = await apiClient.get<PagedResponse<PurchaseOrder>>('/api/purchase-orders', { params })
  return data
}

export async function getPurchaseOrder(id: number): Promise<PurchaseOrder> {
  const { data } = await apiClient.get<PurchaseOrder>(`/api/purchase-orders/${id}`)
  return data
}

export async function createPurchaseOrder(payload: PurchaseOrderPayload): Promise<PurchaseOrder> {
  const { data } = await apiClient.post<PurchaseOrder>('/api/purchase-orders', payload)
  return data
}

export async function updatePurchaseOrder(
  id: number,
  payload: Partial<PurchaseOrderPayload>,
): Promise<PurchaseOrder> {
  const { data } = await apiClient.put<PurchaseOrder>(`/api/purchase-orders/${id}`, payload)
  return data
}

export async function updatePurchaseOrderStatus(
  id: number,
  status: SettablePurchaseOrderStatus,
  reason?: string,
): Promise<PurchaseOrder> {
  const { data } = await apiClient.post<PurchaseOrder>(`/api/purchase-orders/${id}/status`, { status, reason })
  return data
}

export async function adminReviewPurchaseOrder(id: number, notes: string): Promise<PurchaseOrder> {
  const { data } = await apiClient.post<PurchaseOrder>(`/api/purchase-orders/${id}/admin-review`, { notes })
  return data
}

export async function receivePurchaseOrder(
  id: number,
  lines: { line_id: number; quantity: number }[],
): Promise<PurchaseOrder> {
  const { data } = await apiClient.post<PurchaseOrder>(`/api/purchase-orders/${id}/receive`, { lines })
  return data
}

export async function deletePurchaseOrder(id: number): Promise<MessageResponse> {
  const { data } = await apiClient.delete<MessageResponse>(`/api/purchase-orders/${id}`)
  return data
}

export async function restorePurchaseOrder(id: number): Promise<PurchaseOrder> {
  const { data } = await apiClient.post<PurchaseOrder>(`/api/purchase-orders/${id}/restore`)
  return data
}

/** Triggers a browser download of the purchase order PDF via a Blob response. */
export async function downloadPurchaseOrderPdf(id: number, poNumber: string): Promise<void> {
  const response = await apiClient.get(`/api/purchase-orders/${id}/pdf`, { responseType: 'blob' })
  const url = window.URL.createObjectURL(new Blob([response.data]))
  const link = document.createElement('a')
  link.href = url
  link.download = `${poNumber}.pdf`
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}

/** Sends the purchase order PDF as an email attachment. */
export async function emailPurchaseOrder(id: number, toEmail: string, message?: string): Promise<MessageResponse> {
  const { data } = await apiClient.post<MessageResponse>(`/api/purchase-orders/${id}/email`, {
    to_email: toEmail,
    message: message || undefined,
  })
  return data
}
