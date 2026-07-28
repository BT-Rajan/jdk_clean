import type { PagedResponse, ListQueryParams, MessageResponse } from '@/types/common'
import type { Customer, CustomerPayload } from '@/types/customer'
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
