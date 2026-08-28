import type { SearchResult } from '@/types/search'
import { apiClient } from './client'

export async function globalSearch(query: string): Promise<SearchResult[]> {
  const { data } = await apiClient.get<SearchResult[]>('/api/search', { params: { q: query } })
  return data
}
