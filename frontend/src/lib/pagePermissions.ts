/**
 * Maps a URL path to the page_key the backend's department_permissions
 * matrix governs for it -- mirrors backend/app/core/permissions.py's
 * PAGE_KEYS exactly, and must be kept in sync with it (this side of
 * the mapping is inherently frontend-only: the backend has no notion
 * of SPA routes). Display labels for these keys are NOT duplicated
 * here -- see api/permissions.ts:listPermissionPages, which fetches
 * them from the backend's single canonical PAGE_KEY_LABELS.
 *
 * A path with no match here (including /profile, /users, /settings,
 * /communication) is simply ungoverned by this matrix -- PagePermissionGuard
 * lets it through unconditionally. Admin-only pages enforce that
 * separately via AdminOnlyGuard (see routes/AdminOnlyGuard.tsx), not
 * via anything in this file.
 */
const PATH_PREFIX_TO_PAGE_KEY: [string, string][] = [
  ['/dashboard', 'dashboard'],
  ['/customers', 'customers'],
  ['/suppliers', 'suppliers'],
  ['/raw-materials', 'raw_materials'],
  ['/products', 'products'],
  ['/inventory', 'inventory'],
  ['/mrp', 'mrp'],
  ['/purchase-orders', 'purchase_orders'],
  ['/supplier-returns', 'supplier_returns'],
  ['/delivery-notes', 'delivery_notes'],
  ['/deals', 'deals'],
  ['/feasibilities', 'feasibilities'],
  ['/machines', 'machines'],
  ['/quotations', 'quotations'],
  ['/orders', 'orders'],
  ['/production', 'production'],
]

export function getPageKeyForPath(pathname: string): string | null {
  const match = PATH_PREFIX_TO_PAGE_KEY.find(
    ([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )
  return match ? match[1] : null
}
