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
