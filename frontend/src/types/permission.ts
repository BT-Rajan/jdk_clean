export type AccessLevel = 'none' | 'read' | 'write'

export interface PermissionEntry {
  department_id: number
  /** Display convenience, always populated on read -- see
   * types/department.ts for the authoritative Department master shape. */
  department_code?: string
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
