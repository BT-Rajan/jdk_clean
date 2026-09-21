import type { SalesHome } from '@/types/salesHome'
import { apiClient } from './client'

export async function getSalesHome(): Promise<SalesHome> {
  const { data } = await apiClient.get<SalesHome>('/api/sales/home')
  return data
}
