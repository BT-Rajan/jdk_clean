import { apiClient } from './client'
import type { MessageResponse } from '@/types/common'
import type { Order } from '@/types/order'
import type {
  OrderPaymentStatus,
  Payment,
  PaymentFollowupPayload,
  PaymentOverridePayload,
  PaymentPayload,
} from '@/types/payment'

export async function listPayments(orderId: number): Promise<Payment[]> {
  const { data } = await apiClient.get<Payment[]>(`/api/orders/${orderId}/payments`)
  return data
}

export async function getOrderPaymentStatus(orderId: number): Promise<OrderPaymentStatus> {
  const { data } = await apiClient.get<OrderPaymentStatus>(`/api/orders/${orderId}/payments/status`)
  return data
}

export async function createPayment(orderId: number, payload: PaymentPayload): Promise<Payment> {
  const { data } = await apiClient.post<Payment>(`/api/orders/${orderId}/payments`, payload)
  return data
}

export async function deletePayment(orderId: number, paymentId: number): Promise<MessageResponse> {
  const { data } = await apiClient.delete<MessageResponse>(`/api/orders/${orderId}/payments/${paymentId}`)
  return data
}

/** Finance confirming a logged payment actually landed. */
export async function acknowledgePayment(orderId: number, paymentId: number): Promise<Payment> {
  const { data } = await apiClient.post<Payment>(`/api/orders/${orderId}/payments/${paymentId}/acknowledge`)
  return data
}

/** Finance's "otherwise take an override confirmation" branch -- lets a
 * non-credit order into production despite an acknowledged shortfall. */
export async function overridePaymentGate(orderId: number, payload: PaymentOverridePayload): Promise<Order> {
  const { data } = await apiClient.post<Order>(`/api/orders/${orderId}/payments/override`, payload)
  return data
}

export async function setPaymentFollowup(orderId: number, payload: PaymentFollowupPayload): Promise<Order> {
  const { data } = await apiClient.post<Order>(`/api/orders/${orderId}/payments/followup`, payload)
  return data
}
