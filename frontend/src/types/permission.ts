export type AccessLevel = 'none' | 'read' | 'write'
export type Department = 'sales' | 'procurement' | 'warehouse'

export interface PermissionEntry {
  department: Department
  page_key: string
  access_level: AccessLevel
}

/** The calling user's own effective access per page -- page_key -> level. */
export type MyPermissions = Record<string, AccessLevel>

/** A governable page's key + display label, as returned by
 * /api/permissions/pages -- the backend is the only source of this
 * list, there is no hardcoded frontend copy. */
export interface PermissionPage {
  key: string
  label: string
}
