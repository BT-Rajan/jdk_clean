import type { PagedResponse, ListQueryParams, MessageResponse } from '@/types/common'
import type { Customer, CustomerOnboardingStatus, CustomerPayload } from '@/types/customer'
import type { CustomerCreditStatus } from '@/types/payment'
import { apiClient } from './client'

export async function listCustomers(params: ListQueryParams): Promise<PagedResponse<Customer>> {
  const { data } = await apiClient.get<PagedResponse<Customer>>('/api/customers', { params })
  return data
}

export async function getCustomer(id: number): Promise<Customer> {
  const { data } = await apiClient.get<Customer>(`/api/customers/${id}`)
  return data
}

export async function createCustomer(payload: CustomerPayload): Promise<Customer> {
  const { data } = await apiClient.post<Customer>('/api/customers', payload)
  return data
}

export async function updateCustomer(id: number, payload: Partial<CustomerPayload>): Promise<Customer> {
  const { data } = await apiClient.put<Customer>(`/api/customers/${id}`, payload)
  return data
}

export async function deleteCustomer(id: number): Promise<MessageResponse> {
  const { data } = await apiClient.delete<MessageResponse>(`/api/customers/${id}`)
  return data
}

export async function restoreCustomer(id: number): Promise<Customer> {
  const { data } = await apiClient.post<Customer>(`/api/customers/${id}/restore`)
  return data
}

/** Credit limit, current outstanding balance, and what's left before
 * confirming a new order for this customer needs admin approval. */
export async function getCustomerCredit(id: number): Promise<CustomerCreditStatus> {
  const { data } = await apiClient.get<CustomerCreditStatus>(`/api/customers/${id}/credit`)
  return data
}

export async function updateCustomerOnboardingStatus(
  id: number,
  status: CustomerOnboardingStatus,
  reason?: string,
): Promise<Customer> {
  const { data } = await apiClient.post<Customer>(`/api/customers/${id}/onboarding-status`, { status, reason })
  return data
}

export async function uploadCustomerIdDocument(id: number, file: File): Promise<Customer> {
  const form = new FormData()
  form.append('file', file)
  // See api/auth.ts's uploadAvatar for why Content-Type must be cleared
  // here -- apiClient's default JSON header otherwise makes axios
  // JSON.stringify the FormData instead of sending it as multipart.
  const { data } = await apiClient.post<Customer>(`/api/customers/${id}/id-document`, form, {
    headers: { 'Content-Type': undefined },
  })
  return data
}

export async function deleteCustomerIdDocument(id: number): Promise<Customer> {
  const { data } = await apiClient.delete<Customer>(`/api/customers/${id}/id-document`)
  return data
}

/** id-document is served behind auth, same as the avatar endpoint --
 * fetch it as a blob (the interceptor attaches the Authorization header)
 * rather than pointing an <img>/<a> straight at the API path. */
export async function fetchCustomerIdDocumentBlob(id: number): Promise<Blob> {
  const { data } = await apiClient.get(`/api/customers/${id}/id-document`, { responseType: 'blob' })
  return data
}

export async function verifyCustomerId(id: number): Promise<Customer> {
  const { data } = await apiClient.post<Customer>(`/api/customers/${id}/verify-id`)
  return data
}

export async function unverifyCustomerId(id: number): Promise<Customer> {
  const { data } = await apiClient.post<Customer>(`/api/customers/${id}/unverify-id`)
  return data
}
