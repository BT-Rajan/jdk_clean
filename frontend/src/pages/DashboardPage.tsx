import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { GlassCard, Button, Alert, Pagination } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { useCompanyName } from '@/hooks/useCompanyName'
import { useDashboardPreferences } from '@/hooks/useDashboardPreferences'
import { getDashboardStats } from '@/api/dashboard'
import { listNotifications } from '@/api/notifications'
import { getPageKeyForPath } from '@/lib/pagePermissions'
import { useClientPagination } from '@/hooks/useClientPagination'
import { getApiErrorMessage } from '@/lib/apiError'
import { formatCurrency } from '@/lib/currency'
import type { DashboardStatsResponse } from '@/types/dashboard'
import type { Notification, NotificationSeverity } from '@/types/notification'
import { StatsWidget, GraphWidget, SkeletonWidget } from '@/components/dashboard/DashboardWidgets'

// Reuses the exact same live, permission-scoped feed the header's
// notification bell shows (GET /api/notifications -- see
// NotificationsModal.tsx, which this section's card styling mirrors) --
// not a second to-do system. Severity labels/colors intentionally match
// the bell's modal so the same item reads the same way in both places.
const severityColor: Record<NotificationSeverity, string> = {
  high: 'bg-red-500/10 border-red-500/30 text-red-300',
  medium: 'bg-amber-500/10 border-amber-500/30 text-amber-300',
  low: 'bg-white/5 border-white/10 text-white/50',
}
const severityLabel: Record<NotificationSeverity, string> = {
  high: 'Needs attention',
  medium: 'Follow up',
  low: 'FYI',
}
const severityRank: Record<NotificationSeverity, number> = { high: 0, medium: 1, low: 2 }

// Only shortcuts the nav menu can't reach in one click (create pages) --
// anything that is itself a menu item (e.g. Production Planning -> /mrp)
// is left to the menu. A fixed, deliberately short list, filtered below
// by the same department_permissions-derived visibility AppLayout's nav
// uses, so a user never sees a shortcut to a section they can't open. No "New
// Order" here: orders are only ever created via quote conversion or
// logging a sale (see api/orders.ts), there is no bare create route.
interface QuickAction {
  label: string
  to: string
}
const QUICK_ACTIONS: QuickAction[] = [
  { label: 'New Customer', to: '/customers/new' },
  { label: 'New Feasibility', to: '/feasibilities/new' },
  { label: 'New Quotation', to: '/quotations/new' },
  { label: 'Purchase Order', to: '/purchase-orders/new' },
]

// Only mapped when a stat corresponds to exactly one list page -- a few
// stats (open/cancelled deals, auto-created this month, pending admin
// reviews) span multiple record types with no single page to land on,
// so those cards are intentionally left unmapped and stay static.
const STAT_ROUTES: Record<string, string> = {
  customers_month: '/customers',
  quotations_month: '/quotations',
  orders_month: '/orders',
  purchase_orders: '/purchase-orders',
  purchase_orders_pending: '/purchase-orders',
  suppliers_count: '/suppliers',
  inventory_items: '/inventory',
  inventory_value: '/inventory',
  low_stock_count: '/inventory',
  raw_materials_count: '/raw-materials',
  production_active: '/production',
  production_completion: '/production',
  production_delayed: '/production',
  production_this_month: '/production',
  production_capacity_utilization: '/production',
  bom_missing_count: '/feasibilities',
}

export function DashboardPage() {
  const { user, permissions } = useAuth()
  const companyName = useCompanyName()
  const { isLoading: prefsLoading, getEnabledWidgets } = useDashboardPreferences(user?.role)

  const [data, setData] = useState<DashboardStatsResponse | null>(null)
  const [statsLoading, setStatsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [notifications, setNotifications] = useState<Notification[]>([])
  const [notifLoading, setNotifLoading] = useState(true)
  const [notifError, setNotifError] = useState<string | null>(null)

  useEffect(() => {
    getDashboardStats()
      .then(setData)
      .catch((err) => setError(getApiErrorMessage(err)))
      .finally(() => setStatsLoading(false))
  }, [])

  useEffect(() => {
    listNotifications()
      .then((res) => setNotifications(res.items))
      .catch((err) => setNotifError(getApiErrorMessage(err)))
      .finally(() => setNotifLoading(false))
  }, [])

  const enabledWidgets = getEnabledWidgets()
  const isLoading = prefsLoading || statsLoading

  const sortedNotifications = useMemo(
    () =>
      [...notifications].sort(
        (a, b) => severityRank[a.severity] - severityRank[b.severity] || (a.created_at < b.created_at ? 1 : -1),
      ),
    [notifications],
  )
  const notificationsPager = useClientPagination(sortedNotifications)

  // Same visibility rule AppLayout's nav applies to its links -- a page
  // with no page_key (ungoverned) or still-loading permissions shows;
  // one explicitly set to 'none' is hidden. Keeps quick actions from
  // ever pointing at a section this user's department can't open.
  const visibleQuickActions = useMemo(
    () =>
      QUICK_ACTIONS.filter((action) => {
        const pageKey = getPageKeyForPath(action.to)
        if (pageKey === null) return true
        if (!permissions) return true
        return permissions[pageKey] !== undefined && permissions[pageKey] !== 'none'
      }),
    [permissions],
  )

  return (
    <AppLayout>
      <h1 className="font-display text-3xl font-medium text-white">
        Welcome, <span className="text-gradient-gold">{user?.full_name}</span>
      </h1>
      <p className="mt-2 text-sm text-white/50">You're signed in to the {companyName ?? 'JDK MEA'} workspace.</p>

      <Alert variant="error">{error}</Alert>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h2 className="mb-4 font-display text-lg font-medium text-white">Needs Attention</h2>
          {notifLoading ? (
            <GlassCard className="p-6 text-sm text-white/40">Loading…</GlassCard>
          ) : notifError ? (
            <Alert variant="error">{notifError}</Alert>
          ) : sortedNotifications.length === 0 ? (
            <GlassCard className="p-6 text-sm text-white/50">You're all caught up — nothing needs action right now.</GlassCard>
          ) : (
            <div className="space-y-3">
              {notificationsPager.pageItems.map((n) => (
                <Link
                  key={n.id}
                  to={n.link}
                  className="block rounded-lg border border-white/10 bg-white/5 p-4 transition-colors hover:border-white/20 hover:bg-white/10"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-medium text-white">{n.title}</p>
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${severityColor[n.severity]}`}>
                      {severityLabel[n.severity]}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-white/60">{n.message}</p>
                </Link>
              ))}
              <Pagination className="" {...notificationsPager.pagerProps} />
            </div>
          )}
        </div>

        <div>
          <h2 className="mb-4 font-display text-lg font-medium text-white">Quick Actions</h2>
          {visibleQuickActions.length === 0 ? (
            <GlassCard className="p-6 text-sm text-white/50">No quick actions available for your role.</GlassCard>
          ) : (
            <div className="flex flex-col gap-2">
              {visibleQuickActions.map((action) => (
                <Link key={action.to} to={action.to}>
                  <Button variant="ghost" className="w-full">
                    {action.label}
                  </Button>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {!isLoading && !error && enabledWidgets.length > 0 && (
        <div className="mt-10">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="font-display text-lg font-medium text-white">Overview</h2>
            <Link to="/dashboard/customize">
              <button className="text-sm font-medium text-gold-300 transition-colors hover:text-gold-200">
                Customize →
              </button>
            </Link>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {enabledWidgets.map((widget) => {
              if (widget.type === 'stats') {
                const stat = data?.stats[widget.dataSource]
                // Only inventory_value is a money amount among the stats
                // dashboard_service.py computes -- everything else here is
                // a plain count, so only this one gets currency formatting.
                const value =
                  widget.dataSource === 'inventory_value' && typeof stat?.value === 'number'
                    ? formatCurrency(stat.value)
                    : (stat?.value ?? '—')
                return (
                  <StatsWidget
                    key={widget.id}
                    title={widget.title}
                    value={value}
                    trend={stat?.trend}
                    to={STAT_ROUTES[widget.dataSource]}
                  />
                )
              }
              const graphData = data?.graphs[widget.dataSource] ?? []
              return <GraphWidget key={widget.id} title={widget.title} data={graphData} />
            })}
          </div>
        </div>
      )}

      {isLoading && (
        <div className="mt-8">
          <h2 className="mb-6 font-display text-xl font-medium text-white">Loading Dashboard...</h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {[1, 2, 3].map((i) => (
              <SkeletonWidget key={i} type={i % 2 === 0 ? 'graph' : 'stats'} />
            ))}
          </div>
        </div>
      )}

      {!isLoading && !error && enabledWidgets.length === 0 && (
        <GlassCard className="mt-8 p-8 text-center">
          <p className="text-white/60">No widgets enabled on your dashboard</p>
          <Link to="/dashboard/customize">
            <Button className="mt-4">Customize Dashboard</Button>
          </Link>
        </GlassCard>
      )}
    </AppLayout>
  )
}
