/**
 * App-wide currency standard: Kuwaiti Dinar (KWD). KWD is subdivided into
 * 1,000 fils rather than 100, so amounts are conventionally shown with 3
 * decimal places (e.g. "KWD 1,234.500"), not 2 -- this matters for actual
 * precision, not just display: fils-level amounts would silently round
 * away with a 2-decimal formatter.
 *
 * Every page should use this instead of calling .toLocaleString() (or
 * hardcoding a symbol) directly on a money value -- that's what caused
 * the previous inconsistency (some pages showed plain numbers with no
 * currency at all, one showed ₹).
 */

export const CURRENCY_CODE = 'KWD'

/** "KWD 1,234.500". Accepts a number, a numeric string, or null/undefined
 * (renders as '—'). */
export function formatCurrency(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—'
  const num = typeof value === 'string' ? Number(value) : value
  if (Number.isNaN(num)) return '—'
  return `${CURRENCY_CODE} ${num.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`
}
