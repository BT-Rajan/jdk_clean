import { apiClient } from './client'
import type { CalendarEvent, CalendarEventInput, DaySnapshot, MentionableUser } from '@/types/calendar'

export async function listCalendarEvents(year: number, month: number): Promise<CalendarEvent[]> {
  const { data } = await apiClient.get<CalendarEvent[]>('/api/calendar/events', { params: { year, month } })
  return data
}

export async function createCalendarEvent(payload: CalendarEventInput): Promise<CalendarEvent> {
  const { data } = await apiClient.post<CalendarEvent>('/api/calendar/events', payload)
  return data
}

export async function updateCalendarEvent(id: number, payload: CalendarEventInput): Promise<CalendarEvent> {
  const { data } = await apiClient.put<CalendarEvent>(`/api/calendar/events/${id}`, payload)
  return data
}

export async function deleteCalendarEvent(id: number): Promise<void> {
  await apiClient.delete(`/api/calendar/events/${id}`)
}

export async function listMentionableUsers(): Promise<MentionableUser[]> {
  const { data } = await apiClient.get<MentionableUser[]>('/api/calendar/mentionable-users')
  return data
}

/** What's already logged for a given day (production, sales) plus
 * whether it's still a legal target for logging something new -- powers
 * the calendar's day-actions popup. */
export async function getDaySnapshot(isoDate: string): Promise<DaySnapshot> {
  const { data } = await apiClient.get<DaySnapshot>('/api/calendar/day-snapshot', { params: { date: isoDate } })
  return data
}

/** Downloads the ICS-compatible export for a given month and triggers a
 * browser save -- goes through apiClient (not a plain <a href>) since
 * the endpoint requires the bearer token the same as every other call. */
export async function downloadCalendarIcs(year: number, month: number): Promise<void> {
  const response = await apiClient.get('/api/calendar/events.ics', {
    params: { year, month },
    responseType: 'blob',
  })
  const url = URL.createObjectURL(response.data as Blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `calendar-${year}-${String(month).padStart(2, '0')}.ics`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
