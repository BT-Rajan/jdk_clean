import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { GlassCard, Button, Alert } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { useDashboardPreferences } from '@/hooks/useDashboardPreferences'
import { getDashboardStats } from '@/api/dashboard'
import { getApiErrorMessage } from '@/lib/apiError'
import { formatCurrency } from '@/lib/currency'
import type { DashboardStatsResponse } from '@/types/dashboard'
import { StatsWidget, GraphWidget, SkeletonWidget } from '@/components/dashboard/DashboardWidgets'

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
  const { user } = useAuth()
  const { isLoading: prefsLoading, getEnabledWidgets } = useDashboardPreferences(user?.role)

  const [data, setData] = useState<DashboardStatsResponse | null>(null)
  const [statsLoading, setStatsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getDashboardStats()
      .then(setData)
      .catch((err) => setError(getApiErrorMessage(err)))
      .finally(() => setStatsLoading(false))
  }, [])

  const enabledWidgets = getEnabledWidgets()
  const isLoading = prefsLoading || statsLoading

  return (
    <AppLayout>
      <h1 className="font-display text-3xl font-medium text-white">
        Welcome, <span className="text-gradient-gold">{user?.full_name}</span>
      </h1>
      <p className="mt-2 text-sm text-white/50">You're signed in to the JDK MEA workspace.</p>

      <Alert variant="error">{error}</Alert>

      {!isLoading && !error && enabledWidgets.length > 0 && (
        <div className="mt-8">
          <div className="mb-6 flex items-center justify-between">
            <Link to="/dashboard/customize">
              <button className="text-sm font-medium text-gold-300 transition-colors hover:text-gold-200">
                Customize →
              </button>
            </Link>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
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
          <div className="grid gap-6 sm:grid-cols-2">
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
