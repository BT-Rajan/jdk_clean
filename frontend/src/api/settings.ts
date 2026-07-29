import type { Settings, SettingsPayload } from '@/types/settings'
import { apiClient } from './client'

export async function getSettings(): Promise<Settings> {
  const { data } = await apiClient.get<Settings>('/api/settings')
  return data
}

export async function updateSettings(payload: SettingsPayload): Promise<Settings> {
  const { data } = await apiClient.put<Settings>('/api/settings', payload)
  return data
}
