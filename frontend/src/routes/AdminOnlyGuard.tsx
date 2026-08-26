import { Navigate, Outlet } from 'react-router-dom'
import { FullScreenLoader } from '@/components/layout/FullScreenLoader'
import { useAuth } from '@/hooks/useAuth'
import { isAdmin } from '@/lib/roles'

/** Sits inside ProtectedRoute/PagePermissionGuard, wrapping routes that
 * are admin-only regardless of the department permission matrix
 * (Settings, Communication, Users). Previously each of those pages
 * duplicated an `isAdmin(user?.role) ? ... : <Navigate>` check inline
 * -- one page (Users) had no such check at all and relied only on the
 * backend's 403, so a non-admin hitting /users saw a broken shell
 * instead of a clean redirect. Centralizing here fixes both: no more
 * copy-pasted checks, and every admin-only route is covered the same
 * way, automatically, just by nesting under this route. */
export function AdminOnlyGuard() {
  const { user, status } = useAuth()

  if (status === 'bootstrapping') {
    return <FullScreenLoader />
  }

  if (!isAdmin(user?.role)) {
    return <Navigate to="/dashboard" replace />
  }

  return <Outlet />
}
