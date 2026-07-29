import type { DashboardStatsResponse } from '@/types/dashboard'
import { apiClient } from './client'

export async function getDashboardStats(): Promise<DashboardStatsResponse> {
  const { data } = await apiClient.get<DashboardStatsResponse>('/api/dashboard/stats')
  return data
}
