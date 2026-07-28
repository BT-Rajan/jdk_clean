/**
 * Single source of truth for how many rows every list table shows per
 * page. Used by usePagedResource (customers, suppliers, raw materials,
 * products, quotations, orders, users) and directly by InventoryPage's
 * two tables (low stock, movements), which don't go through that hook
 * but should still match everyone else.
 */
export const DEFAULT_PAGE_SIZE = 10
