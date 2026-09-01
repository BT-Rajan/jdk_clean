/**
 * Single source of truth for how many rows every list table shows per
 * page. Used by usePagedResource (customers, suppliers, raw materials,
 * products, quotations, orders, users) and directly by InventoryPage's
 * two tables (low stock, movements), which don't go through that hook
 * but should still match everyone else.
 */
export const DEFAULT_PAGE_SIZE = 10

/**
 * Mirrors backend/app/core/workflow.py's MAX_BACKDATE_DAYS -- how many
 * days in the past a "quick log" entry (production output, a sale) can
 * be backdated to. Display-only here (the real enforcement is
 * server-side); used by the calendar's day-actions popup to explain why
 * logging is disabled for a given day.
 */
export const MAX_BACKDATE_DAYS = 3
