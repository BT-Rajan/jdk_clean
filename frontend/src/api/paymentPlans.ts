import { apiClient } from './client'
import type { MessageResponse } from '@/types/common'
import type { PaymentPlan, PaymentPlanPayload } from '@/types/paymentPlan'

export async function listPaymentPlans(orderId: number): Promise<PaymentPlan[]> {
  const { data } = await apiClient.get<PaymentPlan[]>(`/api/orders/${orderId}/payment-plans`)
  return data
}

export async function createPaymentPlan(orderId: number, payload: PaymentPlanPayload): Promise<PaymentPlan> {
  const { data } = await apiClient.post<PaymentPlan>(`/api/orders/${orderId}/payment-plans`, payload)
  return data
}

export async function deletePaymentPlan(orderId: number, paymentPlanId: number): Promise<MessageResponse> {
  const { data } = await apiClient.delete<MessageResponse>(`/api/orders/${orderId}/payment-plans/${paymentPlanId}`)
  return data
}
