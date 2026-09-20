import { apiClient } from './client'
import type { CollectionQueueRow } from '@/types/payment'

export async function listCollectionQueue(): Promise<CollectionQueueRow[]> {
  const { data } = await apiClient.get<CollectionQueueRow[]>('/api/collection-queue')
  return data
}
