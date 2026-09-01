import type { PagedResponse, ListQueryParams, MessageResponse } from '@/types/common'
import type { Order, OrderPayload, SettableOrderStatus, SplitOrderLineInput } from '@/types/order'
import type { OrderJourney } from '@/types/orderJourney'
import { apiClient } from './client'

export interface OrderListParams extends ListQueryParams {
  customer_id?: number
}

export async function listOrders(params: OrderListParams): Promise<PagedResponse<Order>> {
  const { data } = await apiClient.get<PagedResponse<Order>>('/api/orders', { params })
  return data
}

export async function getOrder(id: number): Promise<Order> {
  const { data } = await apiClient.get<Order>(`/api/orders/${id}`)
  return data
}

export async function approveOrder(id: number): Promise<Order> {
  const { data } = await apiClient.post<Order>(`/api/orders/${id}/approve`)
  return data
}

export async function splitOrder(id: number, lines: SplitOrderLineInput[]): Promise<Order> {
  const { data } = await apiClient.post<Order>(`/api/orders/${id}/split`, { lines })
  return data
}

export async function getOrderJourney(id: number): Promise<OrderJourney> {
  const { data } = await apiClient.get<OrderJourney>(`/api/orders/${id}/journey`)
  return data
}

export async function createOrder(payload: OrderPayload): Promise<Order> {
  const { data } = await apiClient.post<Order>('/api/orders', payload)
  return data
}

export interface OrderQuickLogLinePayload {
  product_id: number
  quantity: number
  unit_price: number
}

export interface OrderQuickLogPayload {
  customer_id: number
  lines: OrderQuickLogLinePayload[]
  notes?: string
  /** ISO date (YYYY-MM-DD) -- defaults to today server-side when omitted. */
  entry_date?: string
}

/** Creates an order, confirms it, and issues a delivery note for it in
 * one call, for a sale that's already happened -- see
 * backend/app/services/order_service.py's log_sale. */
export async function logSale(payload: OrderQuickLogPayload): Promise<Order> {
  const { data } = await apiClient.post<Order>('/api/orders/log', payload)
  return data
}

export async function updateOrder(id: number, payload: Partial<OrderPayload>): Promise<Order> {
  const { data } = await apiClient.put<Order>(`/api/orders/${id}`, payload)
  return data
}

export async function updateOrderStatus(id: number, status: SettableOrderStatus, reason?: string): Promise<Order> {
  const { data } = await apiClient.post<Order>(`/api/orders/${id}/status`, { status, reason })
  return data
}

export async function adminReviewOrder(id: number, notes: string): Promise<Order> {
  const { data } = await apiClient.post<Order>(`/api/orders/${id}/admin-review`, { notes })
  return data
}

export async function deleteOrder(id: number): Promise<MessageResponse> {
  const { data } = await apiClient.delete<MessageResponse>(`/api/orders/${id}`)
  return data
}

export async function restoreOrder(id: number): Promise<Order> {
  const { data } = await apiClient.post<Order>(`/api/orders/${id}/restore`)
  return data
}

/** Triggers a browser download of the order PDF via a Blob response. */
export async function downloadOrderPdf(id: number, orderNumber: string): Promise<void> {
  const response = await apiClient.get(`/api/orders/${id}/pdf`, { responseType: 'blob' })
  const url = window.URL.createObjectURL(new Blob([response.data]))
  const link = document.createElement('a')
  link.href = url
  link.download = `${orderNumber}.pdf`
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}

/** Sends the order PDF as an email attachment. */
export async function emailOrder(id: number, toEmail: string, message?: string): Promise<MessageResponse> {
  const { data } = await apiClient.post<MessageResponse>(`/api/orders/${id}/email`, {
    to_email: toEmail,
    message: message || undefined,
  })
  return data
}

/** Same order PDF, framed as a payment request (amount due, what's
 * already been paid) instead of a plain confirmation -- see
 * backend/app/api/orders.py's request_payment. Records
 * payment_requested_at either way; there's no online payment link yet,
 * the customer pays outside the app and someone records it via
 * createPayment once it's confirmed to have arrived. */
export async function requestPayment(id: number, toEmail: string, message?: string): Promise<Order> {
  const { data } = await apiClient.post<Order>(`/api/orders/${id}/request-payment`, {
    to_email: toEmail,
    message: message || undefined,
  })
  return data
}
