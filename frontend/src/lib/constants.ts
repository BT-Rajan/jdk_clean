/**
 * Single source of truth for how many rows every list shows per page.
 * Used by usePagedResource (customers, suppliers, raw materials,
 * products, quotations, orders, users), directly by InventoryPage's
 * tables, and by useClientPagination (the lists on the dashboard and
 * department home pages), so they all match.
 */
export const DEFAULT_PAGE_SIZE = 5

/**
 * Mirrors backend/app/core/workflow.py's MAX_BACKDATE_DAYS -- how many
 * days in the past a "quick log" entry (production output, a sale) can
 * be backdated to. Display-only here (the real enforcement is
 * server-side); used by the calendar's day-actions popup to explain why
 * logging is disabled for a given day.
 */
export const MAX_BACKDATE_DAYS = 3
