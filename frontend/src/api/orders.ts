import type { PagedResponse, ListQueryParams, MessageResponse } from '@/types/common'
import type { Order, OrderPayload, SettableOrderStatus } from '@/types/order'
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

export async function createOrder(payload: OrderPayload): Promise<Order> {
  const { data } = await apiClient.post<Order>('/api/orders', payload)
  return data
}

export async function updateOrder(id: number, payload: Partial<OrderPayload>): Promise<Order> {
  const { data } = await apiClient.put<Order>(`/api/orders/${id}`, payload)
  return data
}

export async function updateOrderStatus(id: number, status: SettableOrderStatus): Promise<Order> {
  const { data } = await apiClient.post<Order>(`/api/orders/${id}/status`, { status })
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
