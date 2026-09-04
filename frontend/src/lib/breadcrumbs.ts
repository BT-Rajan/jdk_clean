/** Human label for each static path segment used across App.tsx's routes,
 * kept in sync with each page's own <h1>/PageHeader title so the
 * breadcrumb trail never uses different wording than the page it points
 * to. `indexRoute: false` marks a segment that has no page of its own
 * (nothing is mounted at that exact path) -- see /deals, which only has
 * a :id detail route -- so Breadcrumbs renders it as plain text instead
 * of a dead link. */
interface SegmentInfo {
  label: string
  indexRoute?: false
}

const SEGMENT_LABELS: Record<string, SegmentInfo> = {
  dashboard: { label: 'Dashboard' },
  customize: { label: 'Customize dashboard' },
  profile: { label: 'Your profile' },
  'master-data': { label: 'Master Data' },
  customers: { label: 'Customers' },
  suppliers: { label: 'Suppliers' },
  'raw-materials': { label: 'Raw materials' },
  products: { label: 'Products' },
  inventory: { label: 'Inventory' },
  adjust: { label: 'Adjust stock' },
  mrp: { label: 'MRP' },
  'purchase-orders': { label: 'Purchase orders' },
  'supplier-returns': { label: 'Supplier returns' },
  'delivery-notes': { label: 'Delivery notes' },
  deals: { label: 'Deals', indexRoute: false },
  feasibilities: { label: 'Feasibility checks' },
  machines: { label: 'Production Line' },
  quotations: { label: 'Quotations' },
  orders: { label: 'Orders' },
  production: { label: 'Production' },
  admin: { label: 'Admin' },
  'roles-permissions': { label: 'Roles & Permissions' },
  settings: { label: 'Settings' },
  communication: { label: 'Communication' },
  users: { label: 'Users' },
  departments: { label: 'Departments' },
  new: { label: 'New' },
  edit: { label: 'Edit' },
}

export interface Breadcrumb {
  label: string
  /** Omitted for the current page (last crumb) and for segments with no
   * page of their own -- see indexRoute above. */
  to?: string
}

/** Builds the breadcrumb trail for a pathname, e.g. "/customers/42/edit"
 * -> Dashboard / Customers / Details / Edit. Returns [] on the dashboard
 * itself (its own <h1> already says "Dashboard", a breadcrumb there
 * would be pure repetition) and on any path Breadcrumbs shouldn't touch
 * (auth pages aren't wrapped in AppLayout at all, so they never reach
 * this function). */
export function buildBreadcrumbs(pathname: string): Breadcrumb[] {
  const segments = pathname.split('/').filter(Boolean)
  if (segments.length === 0 || (segments.length === 1 && segments[0] === 'dashboard')) {
    return []
  }

  // The home crumb is always "Dashboard" -> /dashboard. When the path
  // itself starts with "dashboard" (e.g. /dashboard/customize), that
  // first segment IS the home crumb -- skip it here instead of pushing
  // it a second time.
  const rest = segments[0] === 'dashboard' ? segments.slice(1) : segments
  const trail: Breadcrumb[] = [{ label: 'Dashboard', to: '/dashboard' }]
  let accumulated = segments[0] === 'dashboard' ? '/dashboard' : ''
  for (const segment of rest) {
    accumulated += `/${segment}`
    const known = SEGMENT_LABELS[segment]
    const label = known?.label ?? (/^\d+$/.test(segment) ? 'Details' : titleCaseFallback(segment))
    const indexRoute = known?.indexRoute !== false
    trail.push(indexRoute ? { label, to: accumulated } : { label })
  }

  // Last crumb is always the current page -- never a link, regardless
  // of whether its own segment has an index route.
  const last = trail[trail.length - 1]
  trail[trail.length - 1] = { label: last.label }
  return trail
}

function titleCaseFallback(segment: string): string {
  return segment
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}
