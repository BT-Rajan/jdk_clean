import { lazy } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { getDepartmentHomePath } from '@/lib/departmentHome'
import { DashboardPage } from '@/pages/DashboardPage'

const SalesHomePage = lazy(() =>
  import('@/pages/sales/SalesHomePage').then((m) => ({ default: m.SalesHomePage })),
)
const PurchasingHomePage = lazy(() =>
  import('@/pages/purchasing/PurchasingHomePage').then((m) => ({ default: m.PurchasingHomePage })),
)
const WarehouseHomePage = lazy(() =>
  import('@/pages/warehouse/WarehouseHomePage').then((m) => ({ default: m.WarehouseHomePage })),
)
const ProductionHomePage = lazy(() =>
  import('@/pages/production/ProductionHomePage').then((m) => ({ default: m.ProductionHomePage })),
)

const HOME_BY_PATH: Record<string, React.ComponentType> = {
  '/sales': SalesHomePage,
  '/purchasing': PurchasingHomePage,
  '/warehouse': WarehouseHomePage,
  '/production-overview': ProductionHomePage,
}

/**
 * What /dashboard renders. Department users get their own department's
 * overview page in place of the generic dashboard; everyone else
 * (admins, users without a department) keeps the generic one. Rendered
 * in place rather than redirected, so /dashboard stays the one landing
 * URL -- login, "/", the nav's Dashboard link and the breadcrumbs all
 * keep working unchanged.
 */
export function DashboardRoute() {
  const { user, permissions } = useAuth()
  const homePath = getDepartmentHomePath(user, permissions)
  const Home = homePath ? HOME_BY_PATH[homePath] : undefined
  return Home ? <Home /> : <DashboardPage />
}
