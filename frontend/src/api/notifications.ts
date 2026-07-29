import type { NotificationsResponse } from '@/types/notification'
import { apiClient } from './client'

export async function listNotifications(): Promise<NotificationsResponse> {
  const { data } = await apiClient.get<NotificationsResponse>('/api/notifications')
  return data
}
