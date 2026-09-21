import type { SalesHome } from '@/types/salesHome'
import { apiClient } from './client'

export async function getSalesHome(): Promise<SalesHome> {
  const { data } = await apiClient.get<SalesHome>('/api/sales/home')
  return data
}

export interface AssignableSalesman {
  id: number
  full_name: string
}

/** Who a customer can be assigned to. Sales Manager / admin only. */
export async function listAssignableSalesmen(): Promise<AssignableSalesman[]> {
  const { data } = await apiClient.get<AssignableSalesman[]>('/api/sales/salesmen')
  return data
}
