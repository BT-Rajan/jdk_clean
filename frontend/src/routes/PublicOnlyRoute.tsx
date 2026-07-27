import { Navigate, Outlet } from 'react-router-dom'
import { FullScreenLoader } from '@/components/layout/FullScreenLoader'
import { useAuth } from '@/hooks/useAuth'

export function PublicOnlyRoute() {
  const { status } = useAuth()

  if (status === 'bootstrapping') {
    return <FullScreenLoader />
  }

  if (status === 'authenticated') {
    return <Navigate to="/dashboard" replace />
  }

  return <Outlet />
}
