/**
 * Maps a URL path to the page_key the backend's department_permissions
 * matrix governs for it -- mirrors backend/app/core/permissions.py's
 * PAGE_KEYS exactly, and must be kept in sync with it.
 *
 * /factory-setup deliberately maps to 'products' -- it isn't a distinct
 * backend resource, it's a frontend page composing the products and
 * machines APIs to edit a product's formula, so it's governed by the
 * same permission as the Products page itself.
 *
 * Paths not covered here (dashboard sub-routes aside, which map to
 * 'dashboard') are considered ungoverned -- /profile is always
 * self-accessible, /users and /settings are always admin/manager-only
 * regardless of this matrix (see PagePermissionGuard).
 */
/** Human-readable labels for each page_key, in a sensible display order
 * for the Access Control grid -- same list as backend PAGE_KEYS. */
export const PAGE_LABELS: [string, string][] = [
  ['dashboard', 'Dashboard'],
  ['customers', 'Customers'],
  ['suppliers', 'Suppliers'],
  ['raw_materials', 'Raw Materials'],
  ['products', 'Products (incl. Factory Setup)'],
  ['inventory', 'Inventory'],
  ['mrp', 'MRP'],
  ['purchase_orders', 'Purchase Orders'],
  ['delivery_notes', 'Delivery Notes'],
  ['deals', 'Deals'],
  ['feasibilities', 'Feasibilities'],
  ['machines', 'Machines'],
  ['quotations', 'Quotations'],
  ['orders', 'Orders'],
  ['production', 'Production'],
]

const PATH_PREFIX_TO_PAGE_KEY: [string, string][] = [
  ['/dashboard', 'dashboard'],
  ['/customers', 'customers'],
  ['/suppliers', 'suppliers'],
  ['/raw-materials', 'raw_materials'],
  ['/factory-setup', 'products'],
  ['/products', 'products'],
  ['/inventory', 'inventory'],
  ['/mrp', 'mrp'],
  ['/purchase-orders', 'purchase_orders'],
  ['/delivery-notes', 'delivery_notes'],
  ['/deals', 'deals'],
  ['/feasibilities', 'feasibilities'],
  ['/machines', 'machines'],
  ['/quotations', 'quotations'],
  ['/orders', 'orders'],
  ['/production', 'production'],
]

/** Pages never governed by the department matrix -- always accessible
 * (profile) or always admin/manager-only regardless of it (users,
 * settings, including this matrix's own editor). */
const UNGOVERNED_PATHS = ['/profile', '/change-password', '/users', '/settings']

export function getPageKeyForPath(pathname: string): string | null {
  if (UNGOVERNED_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return null
  }
  const match = PATH_PREFIX_TO_PAGE_KEY.find(
    ([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )
  return match ? match[1] : null
}
