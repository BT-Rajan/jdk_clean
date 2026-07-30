import type { PagedResponse, ListQueryParams, MessageResponse } from '@/types/common'
import type { Order, OrderPayload, SettableOrderStatus } from '@/types/order'
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

export async function getOrderJourney(id: number): Promise<OrderJourney> {
  const { data } = await apiClient.get<OrderJourney>(`/api/orders/${id}/journey`)
  return data
}

export async function createOrder(payload: OrderPayload): Promise<Order> {
  const { data } = await apiClient.post<Order>('/api/orders', payload)
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
