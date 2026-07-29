import type { MrpReport } from '@/types/mrp'
import { apiClient } from './client'

export async function getMrpReport(): Promise<MrpReport> {
  const { data } = await apiClient.get<MrpReport>('/api/mrp')
  return data
}
