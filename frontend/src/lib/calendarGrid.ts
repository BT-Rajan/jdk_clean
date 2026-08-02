function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** YYYY-MM-DD in local time (not UTC) -- matches what the backend's
 * plain DATE column expects and what event_date strings come back as. */
export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function isPastDate(iso: string): boolean {
  return iso < toISODate(new Date())
}

export function isToday(iso: string): boolean {
  return iso === toISODate(new Date())
}

export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** Builds a 7-wide grid of weeks for the given month. Cells outside the
 * month (padding to align weekdays) are null. */
export function getMonthGrid(year: number, month: number): (Date | null)[][] {
  const firstOfMonth = new Date(year, month - 1, 1)
  const startWeekday = firstOfMonth.getDay()
  const daysInMonth = new Date(year, month, 0).getDate()

  const cells: (Date | null)[] = []
  for (let i = 0; i < startWeekday; i++) cells.push(null)
  for (let day = 1; day <= daysInMonth; day++) cells.push(new Date(year, month - 1, day))
  while (cells.length % 7 !== 0) cells.push(null)

  const weeks: (Date | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}
