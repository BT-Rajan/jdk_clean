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
 * /communication, and every /reports/* page, the Reports overview
 * included) is simply ungoverned by this matrix -- PagePermissionGuard
 * lets it through unconditionally. Admin-only pages enforce that
 * separately via AdminOnlyGuard (see routes/AdminOnlyGuard.tsx), not
 * via anything in this file.
 */
const PATH_PREFIX_TO_PAGE_KEY: [string, string][] = [
  ['/dashboard', 'dashboard'],
  // The Sales entry page is a summary of feasibility checks, quotations,
  // orders, and customers -- reuses the orders page key rather than a new
  // permission, same reuse pattern as /purchasing and /warehouse below.
  ['/sales', 'orders'],
  ['/customers', 'customers'],
  ['/suppliers', 'suppliers'],
  ['/raw-materials', 'raw_materials'],
  ['/products', 'products'],
  // The Warehouse entry page is a summary of raw-material and finished-
  // goods stock -- reuses the inventory page key rather than a new
  // permission, same reuse pattern as /purchasing below.
  ['/warehouse', 'inventory'],
  ['/inventory', 'inventory'],
  ['/mrp', 'mrp'],
  // The Purchasing entry page is a summary of purchase orders, suppliers,
  // and raw-material stock -- reuses the purchase_orders page key rather
  // than a new permission, same as /reconciliation reuses 'production'
  // below.
  ['/purchasing', 'purchase_orders'],
  ['/purchase-orders', 'purchase_orders'],
  ['/supplier-returns', 'supplier_returns'],
  ['/delivery-notes', 'delivery_notes'],
  ['/deals', 'deals'],
  ['/feasibilities', 'feasibilities'],
  ['/machines', 'machines'],
  ['/quotations', 'quotations'],
  ['/orders', 'orders'],
  // Reuses the same 'production' page key as /production -- Production
  // Orders are part of the same Production section the backend's
  // department_permissions matrix already governs, not a separate
  // permission to configure. See backend/app/api/production_orders.py.
  ['/production-orders', 'production'],
  // The Production entry page is a summary of production orders and the
  // active batch schedule -- reuses the same 'production' page key rather
  // than a new permission, same reuse pattern as /purchasing above.
  ['/production-overview', 'production'],
  ['/production', 'production'],
  // The Production entry page is a summary of the same Production data,
  // same reasoning as /purchasing above.
  ['/production-overview', 'production'],
  // QC requests are surfaced from within Production Orders already;
  // this list is the same data under the same permission, not a
  // separate QC module -- qc_agents.py's own backend router already
  // reuses page_key="production" for QC the same way.
  ['/qc-requests', 'production'],
  // Reconciliation spans production, materials, QC and delivery, but
  // reuses the same 'production' page key rather than a new one -- see
  // backend/app/api/reconciliation.py's own comment on the same reuse.
  ['/reconciliation', 'production'],
  ['/collection-queue', 'payments'],
]

export function getPageKeyForPath(pathname: string): string | null {
  const match = PATH_PREFIX_TO_PAGE_KEY.find(
    ([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )
  return match ? match[1] : null
}
