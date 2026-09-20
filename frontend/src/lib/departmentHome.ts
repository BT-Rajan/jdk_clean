import { getPageKeyForPath } from '@/lib/pagePermissions'
import type { User } from '@/types/auth'
import type { MyPermissions } from '@/types/permission'

/**
 * Each department's own overview page. For a department user this is
 * what /dashboard shows in place of the generic, widget-based dashboard
 * (see pages/DashboardRoute.tsx). Keyed by departments.code -- the four
 * seeded rows in backend/schema.sql. A department with no entry here
 * (e.g. one an admin created later) simply keeps the generic dashboard.
 */
export const DEPARTMENT_HOME_PATHS: Record<string, string> = {
  sales: '/sales',
  procurement: '/purchasing',
  warehouse: '/warehouse',
  production: '/production-overview',
}

/**
 * The overview path that stands in for /dashboard for this user, or null
 * when they should get the generic dashboard instead: admins (they span
 * every department), users with no department or one with no overview,
 * and users whose department has been denied that overview page in the
 * department_permissions matrix (falling back beats a "no access" wall
 * on their landing page). Permissions still loading (null) don't block
 * the choice -- PagePermissionGuard already waits for them before this
 * ever renders.
 */
export function getDepartmentHomePath(
  user: User | null | undefined,
  permissions: MyPermissions | null,
): string | null {
  if (!user || user.role === 'admin' || !user.department_code) return null
  const path = DEPARTMENT_HOME_PATHS[user.department_code]
  if (!path) return null
  const pageKey = getPageKeyForPath(path)
  if (pageKey && permissions && (permissions[pageKey] ?? 'none') === 'none') return null
  return path
}
