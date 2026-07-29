/**
 * App-wide date/time formatting standard: DD-MM-YYYY for dates,
 * DD-MM-YYYY HH:MM (24-hour) when time matters too. Every page should use
 * these instead of calling toLocaleDateString()/toLocaleString() directly,
 * which render differently depending on the browser's locale -- these two
 * are the single consistent format across the app.
 */

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** DD-MM-YYYY. Accepts a date string (e.g. "2026-07-29"), a datetime
 * string, a Date, or null/undefined (renders as '—'). */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`
}

/** DD-MM-YYYY HH:MM, 24-hour. For timestamps where the time of day
 * matters (when something happened), not plain business dates. */
export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return `${formatDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
