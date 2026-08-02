import { Outlet, useLocation } from 'react-router-dom'
import { FullScreenLoader } from '@/components/layout/FullScreenLoader'
import { NoPageAccessPage } from '@/pages/NoPageAccessPage'
import { useAuth } from '@/hooks/useAuth'
import { getPageKeyForPath } from '@/lib/pagePermissions'

/** Sits inside ProtectedRoute (so it only ever runs for an already-
 * authenticated user) and checks whether this user's department has
 * been granted at least read access to the current page. Paths not
 * governed by the matrix (profile, users, settings, and anything not
 * in the mapping) pass through untouched -- their own pages/guards
 * handle admin-only restrictions separately where relevant.
 *
 * Renders NoPageAccessPage in place rather than redirecting to
 * /dashboard on denial -- redirecting would loop forever for a user
 * denied access to /dashboard itself, since that's the redirect
 * target. */
export function PagePermissionGuard() {
  const { permissions, status } = useAuth()
  const location = useLocation()

  // Permissions load alongside the user at bootstrap/login -- while
  // that's in flight, wait rather than briefly flashing a denial
  // before the real answer arrives.
  if (status === 'authenticated' && permissions === null) {
    return <FullScreenLoader />
  }

  const pageKey = getPageKeyForPath(location.pathname)
  if (pageKey === null) {
    return <Outlet />
  }

  const level = permissions?.[pageKey] ?? 'none'
  if (level === 'none') {
    return <NoPageAccessPage />
  }

  return <Outlet />
}
