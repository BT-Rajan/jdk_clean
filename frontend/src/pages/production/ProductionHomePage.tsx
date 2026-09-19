import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { Alert, Button, EmptyState, GlassCard, PageHeader, Spinner, StatusBadge } from '@/components/ui'
import { StatsWidget } from '@/components/dashboard/DashboardWidgets'
import { getDashboardStats } from '@/api/dashboard'
import { listNotifications } from '@/api/notifications'
import { listProductionBatches } from '@/api/production'
import { listProductionOrders } from '@/api/productionOrders'
import type { DashboardStatsResponse } from '@/types/dashboard'
import type { Notification, NotificationSeverity } from '@/types/notification'
import type { ProductionBatch, ProductionStatus } from '@/types/production'
import type { ProductionOrder } from '@/types/productionOrder'
import { getApiErrorMessage } from '@/lib/apiError'
import { formatDate } from '@/lib/dateFormat'

// Same severity styling the main Dashboard's Needs Attention section (and
// PurchasingHomePage's own copy of it) use -- kept in sync deliberately so
// an item reads the same way everywhere, not a second notification design.
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
const MAX_NEEDS_ATTENTION = 6
const MAX_ORDERS = 5
const MAX_BATCHES = 5

// Production's own slice of the same live notification feed the header
// bell and the main Dashboard already show (GET /api/notifications) --
// not a separate to-do system. See notification_service.py: the
// production_* types and qc_request_admin_review are all about a
// production batch or QC request, and both link into a /production* route.
function isProductionNotification(n: Notification): boolean {
  return n.type.startsWith('production_') || n.type === 'qc_request_admin_review' || n.link.startsWith('/production')
}

const ACTIVE_BATCH_STATUSES: ProductionStatus[] = ['planned', 'in_progress', 'paused']

export function ProductionHomePage() {
  const [stats, setStats] = useState<DashboardStatsResponse | null>(null)
  const [statsLoading, setStatsLoading] = useState(true)
  const [statsError, setStatsError] = useState<string | null>(null)

  const [notifications, setNotifications] = useState<Notification[]>([])
  const [notifLoading, setNotifLoading] = useState(true)

  const [productionOrders, setProductionOrders] = useState<ProductionOrder[]>([])
  const [ordersLoading, setOrdersLoading] = useState(true)

  const [batches, setBatches] = useState<ProductionBatch[]>([])
  const [batchesLoading, setBatchesLoading] = useState(true)

  useEffect(() => {
    getDashboardStats()
      .then(setStats)
      .catch((err) => setStatsError(getApiErrorMessage(err)))
      .finally(() => setStatsLoading(false))
    listNotifications()
      .then((res) => setNotifications(res.items))
      .catch(() => setNotifications([]))
      .finally(() => setNotifLoading(false))
    // Unfiltered (page_size covers realistic volumes, same reasoning as
    // PurchasingHomePage's own open-purchase-orders fetch) and sorted/
    // filtered client-side -- the backend's status filter only takes one
    // value at a time, and "still open" spans several statuses at once.
    listProductionOrders({ page: 1, page_size: 100 })
      .then((result) => setProductionOrders(result.items))
      .catch(() => setProductionOrders([]))
      .finally(() => setOrdersLoading(false))
    listProductionBatches({ page: 1, page_size: 100 })
      .then((result) => setBatches(result.items))
      .catch(() => setBatches([]))
      .finally(() => setBatchesLoading(false))
  }, [])

  const productionNotifications = useMemo(
    () =>
      notifications
        .filter(isProductionNotification)
        .sort((a, b) => severityRank[a.severity] - severityRank[b.severity] || (a.created_at < b.created_at ? 1 : -1))
        .slice(0, MAX_NEEDS_ATTENTION),
    [notifications],
  )

  const plannedOrders = useMemo(() => productionOrders.filter((po) => po.status === 'planned'), [productionOrders])
  const topOrders = useMemo(
    () =>
      [...plannedOrders]
        .sort((a, b) => a.due_date.localeCompare(b.due_date))
        .slice(0, MAX_ORDERS),
    [plannedOrders],
  )

  const activeBatches = useMemo(
    () => batches.filter((b) => ACTIVE_BATCH_STATUSES.includes(b.status)),
    [batches],
  )
  const topBatches = useMemo(
    () =>
      [...activeBatches]
        .sort((a, b) => a.scheduled_end.localeCompare(b.scheduled_end))
        .slice(0, MAX_BATCHES),
    [activeBatches],
  )

  return (
    <AppLayout>
      <PageHeader
        title="Production"
        subtitle="What's scheduled, what's running, and what's falling behind on the floor right now."
      />

      <Alert variant="error">{statsError}</Alert>

      {!statsLoading && stats && (
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatsWidget title="Active batches" value={stats.stats.production_active?.value ?? '—'} to="/production" />
          <StatsWidget title="Delayed batches" value={stats.stats.production_delayed?.value ?? '—'} to="/production" />
          <StatsWidget
            title="Capacity utilization"
            value={stats.stats.production_capacity_utilization?.value ?? '—'}
            to="/machines"
          />
          <StatsWidget title="Completion rate" value={stats.stats.production_completion?.value ?? '—'} to="/production-orders" />
        </div>
      )}
      {statsLoading && (
        <div className="mb-8 flex justify-center py-8">
          <Spinner size={24} className="text-gold-300" />
        </div>
      )}

      <div className="grid min-w-0 gap-6 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2 flex flex-col gap-8">
          <div>
            <h2 className="mb-4 font-display text-lg font-medium text-white">Needs attention</h2>
            {notifLoading ? (
              <GlassCard className="p-6 text-sm text-white/40">Loading…</GlassCard>
            ) : productionNotifications.length === 0 ? (
              <GlassCard className="p-6 text-sm text-white/50">Nothing in production needs action right now.</GlassCard>
            ) : (
              <div className="space-y-3">
                {productionNotifications.map((n) => (
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
              </div>
            )}
          </div>

          <div>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-lg font-medium text-white">What needs scheduling</h2>
              <Link to="/production-orders" className="text-sm text-gold-300 hover:text-gold-200">
                All production orders →
              </Link>
            </div>
            <GlassCard className="min-w-0 overflow-hidden">
              {ordersLoading ? (
                <div className="flex justify-center py-12">
                  <Spinner size={24} className="text-gold-300" />
                </div>
              ) : topOrders.length === 0 ? (
                <EmptyState title="Nothing planned" message="No production order is currently awaiting scheduling." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-white/10 text-xs tracking-wide text-white/40 uppercase">
                        <th className="px-6 py-4 font-medium">Production order</th>
                        <th className="px-6 py-4 font-medium">Product</th>
                        <th className="px-6 py-4 font-medium">Due</th>
                        <th className="px-6 py-4 font-medium">Priority</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topOrders.map((po) => (
                        <tr key={po.id} className="border-b border-white/5 last:border-0">
                          <td className="px-6 py-4">
                            <Link to={`/production-orders/${po.id}`} className="font-medium text-gold-300 hover:text-gold-200">
                              {po.production_order_number}
                            </Link>
                          </td>
                          <td className="px-6 py-4 text-white/60">{po.product_name ?? `#${po.product_id}`}</td>
                          <td className="px-6 py-4 text-white/60">{formatDate(po.due_date)}</td>
                          <td className="px-6 py-4">
                            <StatusBadge status={po.priority} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {plannedOrders.length > topOrders.length && (
                <p className="px-6 pb-4 text-xs text-white/40">
                  +{plannedOrders.length - topOrders.length} more awaiting scheduling not shown here.
                </p>
              )}
            </GlassCard>
          </div>

          <div>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-lg font-medium text-white">What's running now</h2>
              <Link to="/production" className="text-sm text-gold-300 hover:text-gold-200">
                Full production schedule →
              </Link>
            </div>
            <GlassCard className="min-w-0 overflow-hidden">
              {batchesLoading ? (
                <div className="flex justify-center py-12">
                  <Spinner size={24} className="text-gold-300" />
                </div>
              ) : topBatches.length === 0 ? (
                <EmptyState title="Nothing running" message="No batch is currently planned, in progress, or paused." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-white/10 text-xs tracking-wide text-white/40 uppercase">
                        <th className="px-6 py-4 font-medium">Batch</th>
                        <th className="px-6 py-4 font-medium">Product</th>
                        <th className="px-6 py-4 font-medium">Scheduled end</th>
                        <th className="px-6 py-4 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topBatches.map((b) => (
                        <tr key={b.id} className="border-b border-white/5 last:border-0">
                          <td className="px-6 py-4">
                            <Link to={`/production/${b.id}`} className="font-medium text-gold-300 hover:text-gold-200">
                              {b.batch_number}
                            </Link>
                          </td>
                          <td className="px-6 py-4 text-white/60">{b.product_name ?? `#${b.product_id}`}</td>
                          <td className="px-6 py-4 text-white/60">{formatDate(b.scheduled_end)}</td>
                          <td className="px-6 py-4">
                            <StatusBadge status={b.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {activeBatches.length > topBatches.length && (
                <p className="px-6 pb-4 text-xs text-white/40">
                  +{activeBatches.length - topBatches.length} more running batch
                  {activeBatches.length - topBatches.length === 1 ? '' : 'es'} not shown here.
                </p>
              )}
            </GlassCard>
          </div>
        </div>

        <div>
          <h2 className="mb-4 font-display text-lg font-medium text-white">Go to</h2>
          <div className="flex flex-col gap-2">
            <Link to="/production/new">
              <Button variant="ghost" className="w-full justify-start">Log production</Button>
            </Link>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
