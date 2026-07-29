/** Mirrors backend/app/schemas/notification.py. Every item is a live
 * record from the database (an admin-review flag, a low-stock material, a
 * delayed batch, etc.) -- not a stored/mocked notification row. */

export type NotificationSeverity = 'high' | 'medium' | 'low'

export interface Notification {
  id: string
  type: string
  severity: NotificationSeverity
  title: string
  message: string
  /** Frontend route to the record this notification is about. */
  link: string
  created_at: string
}

export interface NotificationsResponse {
  items: Notification[]
  count: number
}
