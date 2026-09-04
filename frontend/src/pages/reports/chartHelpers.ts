import type { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent'

/** Shared recharts styling so every /reports/* chart matches the app's
 * dark/gold theme instead of recharts' light-mode defaults. */
export const TOOLTIP_STYLE = { background: '#12121c', border: '1px solid rgba(212,175,106,0.3)', borderRadius: 8 }
export const TOOLTIP_LABEL_STYLE = { color: '#fff' }
export const AXIS_TICK = { fill: 'rgba(255,255,255,0.55)', fontSize: 12 }
export const GRID_STROKE = 'rgba(255,255,255,0.08)'
export const TOOLTIP_CURSOR = { fill: 'rgba(255,255,255,0.06)' }

/** recharts' own onClick payload types the row as `any` -- this just
 * narrows it back to the real row type at the one point it's read,
 * rather than spreading `any` through every click handler on a page. */
export function onBarClick<T>(setFilter: (row: T) => void) {
  return (data: { payload?: unknown }) => {
    if (data.payload) setFilter(data.payload as T)
  }
}

/** Tooltip formatters receive recharts' own ValueType (number | string |
 * readonly array), never actually anything but a plain number on these
 * charts -- narrow it back down at the one point each formatter reads it. */
export function toNumber(value: ValueType | undefined): number {
  return typeof value === 'number' ? value : Number(value) || 0
}

export type { NameType, ValueType }
