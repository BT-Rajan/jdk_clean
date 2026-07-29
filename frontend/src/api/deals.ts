import type { DealDetail } from '@/types/deal'
import { apiClient } from './client'

export async function getDeal(id: number): Promise<DealDetail> {
  const { data } = await apiClient.get<DealDetail>(`/api/deals/${id}`)
  return data
}
