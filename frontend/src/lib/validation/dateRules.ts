// Shared by every form with a date field that shouldn't be backdated:
// feasibility's required_by_date, quotations' quotation_date/valid_until,
// orders' order_date/requested_delivery_date, delivery notes' delivery_date.
// Mirrors backend/app/core/validators.py:not_in_past.

function todayISODate(): string {
  const d = new Date()
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Use as the `min` attribute on a <input type="date"> to stop the picker
 * from offering past dates in the first place. */
export const todayDateInputMin = todayISODate()

/** Zod .refine() predicate: empty/undefined (unset/optional field) passes;
 * a non-empty date string must not be before today. */
export function isNotPastDate(value: string | undefined): boolean {
  if (!value) return true
  return value >= todayISODate()
}

export const NOT_PAST_DATE_MESSAGE = 'Date cannot be in the past'

/** The opposite case: for a field recording something that already
 * happened (e.g. a payment's date) -- backdating is fine, but it can't
 * be in the future. Mirrors backend/app/core/validators.py:not_in_future. */
export function isNotFutureDate(value: string | undefined): boolean {
  if (!value) return true
  return value <= todayISODate()
}

export const NOT_FUTURE_DATE_MESSAGE = 'Date cannot be in the future'

/** Adds `days` calendar days to an ISO date string ("2026-07-29"),
 * returning an ISO date string. Used for quotations' valid_until, which
 * the backend always derives as quotation_date + 7 days (see
 * backend/app/services/quotation_service.py's QUOTATION_VALIDITY_DAYS) --
 * this mirrors that on the client purely for display, since the server
 * value is what's actually authoritative. Returns '' for an unparseable
 * input rather than throwing, so a form mid-edit never crashes on a
 * momentarily-empty date field. */
export function addDaysISODate(isoDate: string, days: number): string {
  if (!isoDate) return ''
  const d = new Date(`${isoDate}T00:00:00`)
  if (Number.isNaN(d.getTime())) return ''
  d.setDate(d.getDate() + days)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
