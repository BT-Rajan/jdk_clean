// Kuwaiti Dinar (KWD) is subdivided into 1,000 fils, so amounts are
// conventionally shown with 3 decimals, not 2 -- mirrors the web app's
// frontend/src/lib/currency.ts formatCurrency().
export function formatCurrency(value: number): string {
  return `KWD ${value.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`;
}

// Deliberately not date.toISOString().slice(0,10) -- that converts to
// UTC first, which can silently roll the date back a day for anyone
// west of UTC in the evening. Building the string from local
// getFullYear/Month/Date keeps it the date the user actually picked.
export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// App-wide date/time formatting standard, mirrors
// frontend/src/lib/dateFormat.ts exactly -- DD-MM-YYYY for dates,
// DD-MM-YYYY HH:MM (24-hour) when time matters too. Every screen should
// use these instead of toLocaleDateString()/toLocaleString(), which
// render differently depending on device locale settings.
function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** DD-MM-YYYY. Accepts a date string (e.g. "2026-07-29"), a datetime
 * string, a Date, or null/undefined (renders as '—'). */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
}

/** DD-MM-YYYY HH:MM, 24-hour. For timestamps where the time of day
 * matters (when something happened), not plain business dates. */
export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return `${formatDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
