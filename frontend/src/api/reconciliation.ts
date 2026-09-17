import type { ReconciliationException } from '@/types/reconciliation'
import { apiClient } from './client'

export async function getReconciliationExceptions(): Promise<ReconciliationException[]> {
  const { data } = await apiClient.get<ReconciliationException[]>('/api/reconciliation/exceptions')
  return data
}
