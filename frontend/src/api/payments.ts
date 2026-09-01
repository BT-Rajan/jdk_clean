import { apiClient } from './client'
import type { MessageResponse } from '@/types/common'
import type { Payment, PaymentPayload } from '@/types/payment'

export async function listPayments(orderId: number): Promise<Payment[]> {
  const { data } = await apiClient.get<Payment[]>(`/api/orders/${orderId}/payments`)
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
