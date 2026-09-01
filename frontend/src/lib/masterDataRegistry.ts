/**
 * The one list of every master entity in the app -- drives the Master
 * Data nav entry, its hub page, and the command palette's master-data
 * actions, so a new master shows up in all three by adding one row here
 * instead of three separate edits drifting apart. Taxonomy groups match
 * the MDM spec's required master groups (People & Organization,
 * Commercial, Materials, Manufacturing, Planning, Logistics); a group
 * with no entries yet just doesn't render (see groupedMasterData) rather
 * than showing an empty section.
 *
 * pageKey, when set, must match a key in backend/app/core/permissions.py
 * PAGE_KEYS -- entries without one (Users, Departments, Units) are
 * admin/manager-only regardless of the department permission matrix,
 * same as they were before being surfaced here.
 */
export type MasterGroup = 'people_org' | 'commercial' | 'materials' | 'manufacturing' | 'planning' | 'logistics'

export const MASTER_GROUP_LABELS: Record<MasterGroup, string> = {
  people_org: 'People & Organization',
  commercial: 'Commercial',
  materials: 'Materials',
  manufacturing: 'Manufacturing',
  planning: 'Planning',
  logistics: 'Logistics',
}

const GROUP_ORDER: MasterGroup[] = ['people_org', 'commercial', 'materials', 'manufacturing', 'planning', 'logistics']

export interface MasterDataEntry {
  key: string
  label: string
  group: MasterGroup
  route: string
  /** department_permissions page_key this entry is gated by, if any. */
  pageKey?: string
  /** Admin-only regardless of the department permission matrix. */
  adminOnly?: boolean
}

export const MASTER_DATA_REGISTRY: MasterDataEntry[] = [
  // Was routed to /admin?section=users -- Users now has its own list
  // page (pages/users/UsersListPage.tsx) like every other master here,
  // instead of only being reachable as a tab inside Admin.
  { key: 'users', label: 'Users', group: 'people_org', route: '/users', adminOnly: true },
  { key: 'departments', label: 'Departments', group: 'people_org', route: '/departments', adminOnly: true },
  // Roles & Permissions now has its own page (AccessControlPage) instead
  // of linking out to a tab inside Admin -- same fix as Users above.
  {
    key: 'roles-permissions',
    label: 'Roles & Permissions',
    group: 'people_org',
    route: '/roles-permissions',
    adminOnly: true,
  },
  { key: 'org-chart', label: 'Org Chart', group: 'people_org', route: '/admin?section=org-chart', adminOnly: true },
  { key: 'customers', label: 'Customers', group: 'commercial', route: '/customers', pageKey: 'customers' },
  { key: 'suppliers', label: 'Suppliers', group: 'commercial', route: '/suppliers', pageKey: 'suppliers' },
  { key: 'raw_materials', label: 'Raw Materials', group: 'materials', route: '/raw-materials', pageKey: 'raw_materials' },
  { key: 'products', label: 'Products', group: 'materials', route: '/products', pageKey: 'products' },
  { key: 'units', label: 'Units of Measure', group: 'materials', route: '/units', adminOnly: true },
  { key: 'machines', label: 'Machines', group: 'manufacturing', route: '/machines', pageKey: 'machines' },
]

export interface MasterDataGroup {
  group: MasterGroup
  label: string
  items: MasterDataEntry[]
}

export function groupedMasterData(): MasterDataGroup[] {
  return GROUP_ORDER.map((group) => ({
    group,
    label: MASTER_GROUP_LABELS[group],
    items: MASTER_DATA_REGISTRY.filter((entry) => entry.group === group),
  })).filter((g) => g.items.length > 0)
}
