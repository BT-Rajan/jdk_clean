import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { Alert, Badge, Button, EmptyState, GlassCard, PageHeader, Spinner, StatusBadge } from '@/components/ui'
import { StatsWidget } from '@/components/dashboard/DashboardWidgets'
import { getDashboardStats } from '@/api/dashboard'
import { listNotifications } from '@/api/notifications'
import { getMrpReport } from '@/api/mrp'
import { listProductionOrders } from '@/api/productionOrders'
import { listQcRequests } from '@/api/qcRequests'
import type { DashboardStatsResponse } from '@/types/dashboard'
import type { Notification, NotificationSeverity } from '@/types/notification'
import type { MrpRequirementLine } from '@/types/mrp'
import type { ProductionOrder } from '@/types/productionOrder'
import type { QcRequest } from '@/types/qcRequest'
import { getApiErrorMessage } from '@/lib/apiError'
import { formatDate } from '@/lib/dateFormat'

// Same severity styling used by the Dashboard's own Needs Attention
// section and PurchasingHomePage's -- kept consistent deliberately, not
// a separate notification design for Production.
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
const MAX_ORDERS = 6
const MAX_REQUIREMENTS = 5
const MAX_QC = 5

function isProductionNotification(n: Notification): boolean {
  return n.type.startsWith('production_') || n.type === 'qc_request_admin_review' || n.link.startsWith('/production')
}

const QC_OPEN_STATUSES: QcRequest['status'][] = ['requested', 'sample_sent', 'report_received']

export function ProductionOverviewPage() {
  const [stats, setStats] = useState<DashboardStatsResponse | null>(null)
  const [statsLoading, setStatsLoading] = useState(true)
  const [statsError, setStatsError] = useState<string | null>(null)

  const [notifications, setNotifications] = useState<Notification[]>([])
  const [notifLoading, setNotifLoading] = useState(true)

  const [plannedOrders, setPlannedOrders] = useState<ProductionOrder[]>([])
  const [ordersLoading, setOrdersLoading] = useState(true)

  const [requirements, setRequirements] = useState<MrpRequirementLine[]>([])
  const [requirementsLoading, setRequirementsLoading] = useState(true)

  const [qcRequests, setQcRequests] = useState<QcRequest[]>([])
  const [qcLoading, setQcLoading] = useState(true)

  useEffect(() => {
    getDashboardStats()
      .then(setStats)
      .catch((err) => setStatsError(getApiErrorMessage(err)))
      .finally(() => setStatsLoading(false))
    listNotifications()
      .then((res) => setNotifications(res.items))
      .catch(() => setNotifications([]))
      .finally(() => setNotifLoading(false))
    // Unfiltered by due date and sorted client-side -- what "needs
    // production" is everything not yet cancelled, soonest due first.
    listProductionOrders({ page: 1, page_size: 100, status: 'planned' })
      .then((result) => setPlannedOrders(result.items))
      .catch(() => setPlannedOrders([]))
      .finally(() => setOrdersLoading(false))
    getMrpReport()
      .then((report) => setRequirements(report.items))
      .catch(() => setRequirements([]))
      .finally(() => setRequirementsLoading(false))
    // page_size covers realistic open-QC volumes; the three open statuses
    // are fetched together since the API filters on one status at a time.
    Promise.all(QC_OPEN_STATUSES.map((status) => listQcRequests({ status, page: 1, page_size: 50 })))
      .then((pages) => setQcRequests(pages.flatMap((p) => p.items)))
      .catch(() => setQcRequests([]))
      .finally(() => setQcLoading(false))
  }, [])

  const productionNotifications = useMemo(
    () =>
      notifications
        .filter(isProductionNotification)
        .sort((a, b) => severityRank[a.severity] - severityRank[b.severity] || (a.created_at < b.created_at ? 1 : -1))
        .slice(0, MAX_NEEDS_ATTENTION),
    [notifications],
  )

  const topOrders = useMemo(
    () => [...plannedOrders].sort((a, b) => a.due_date.localeCompare(b.due_date)).slice(0, MAX_ORDERS),
    [plannedOrders],
  )

  const topRequirements = useMemo(
    () => [...requirements].sort((a, b) => b.shortfall - a.shortfall).slice(0, MAX_REQUIREMENTS),
    [requirements],
  )

  const topQc = useMemo(
    () => [...qcRequests].sort((a, b) => a.request_date.localeCompare(b.request_date)).slice(0, MAX_QC),
    [qcRequests],
  )

  return (
    <AppLayout>
      <PageHeader
        title="Production"
        subtitle="What needs producing, whether the materials for it are ready, and where every batch sits between the shop floor and released stock."
      />

      <Alert variant="error">{statsError}</Alert>

      {!statsLoading && stats && (
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatsWidget title="Active production" value={stats.stats.production_active?.value ?? '—'} to="/production-orders" />
          <StatsWidget title="Delayed" value={stats.stats.production_delayed?.value ?? '—'} to="/production-orders" />
          <StatsWidget title="Completion this month" value={stats.stats.production_completion?.value ?? '—'} to="/reports/production-report" />
          <StatsWidget title="Awaiting quality check" value={qcRequests.length || (qcLoading ? '—' : 0)} to="/qc-requests" />
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
              <h2 className="font-display text-lg font-medium text-white">What needs production</h2>
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
                <EmptyState title="Nothing planned" message="No production order is currently planned." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-white/10 text-xs tracking-wide text-white/40 uppercase">
                        <th className="px-6 py-4 font-medium">Production order</th>
                        <th className="px-6 py-4 font-medium">Product</th>
                        <th className="px-6 py-4 font-medium">Origin</th>
                        <th className="px-6 py-4 font-medium">Qty</th>
                        <th className="px-6 py-4 font-medium">Due</th>
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
                          <td className="px-6 py-4 text-white">
                            {po.product_code ? `${po.product_code} — ${po.product_name}` : `#${po.product_id}`}
                          </td>
                          <td className="px-6 py-4 text-white/60">
                            {po.order_id ? (
                              // Traceable to the order that created the need, but the batch
                              // itself is still general stock once produced -- see the
                              // Production Order detail page for how release works.
                              <Link to={`/orders/${po.order_id}`} className="hover:text-white/80">
                                Order {po.order_number}
                              </Link>
                            ) : (
                              <Badge tone="gold">Stock</Badge>
                            )}
                          </td>
                          <td className="px-6 py-4 text-white/60">
                            {po.planned_quantity} {po.unit ?? ''}
                          </td>
                          <td className="px-6 py-4 text-white/60">{formatDate(po.due_date)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {plannedOrders.length > topOrders.length && (
                <p className="px-6 pb-4 text-xs text-white/40">
                  +{plannedOrders.length - topOrders.length} more planned production order{plannedOrders.length - topOrders.length === 1 ? '' : 's'} not shown here.
                </p>
              )}
            </GlassCard>
          </div>

          <div>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-lg font-medium text-white">Material requirements</h2>
              <Link to="/mrp" className="text-sm text-gold-300 hover:text-gold-200">
                Full requirements plan →
              </Link>
            </div>
            <GlassCard className="min-w-0 overflow-hidden">
              {requirementsLoading ? (
                <div className="flex justify-center py-12">
                  <Spinner size={24} className="text-gold-300" />
                </div>
              ) : topRequirements.length === 0 ? (
                <EmptyState
                  title="Materials ready"
                  message="Everything currently planned for production can be covered by raw-material stock on hand."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-white/10 text-xs tracking-wide text-white/40 uppercase">
                        <th className="px-6 py-4 font-medium">Material</th>
                        <th className="px-6 py-4 font-medium">Available</th>
                        <th className="px-6 py-4 font-medium">Shortfall</th>
                        <th className="px-6 py-4 font-medium">Coverage</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topRequirements.map((item) => (
                        <tr key={item.raw_material_id} className="border-b border-white/5 last:border-0">
                          <td className="px-6 py-4">
                            <Link to={`/raw-materials/${item.raw_material_id}`} className="font-medium text-gold-300 hover:text-gold-200">
                              {item.code} — {item.name}
                            </Link>
                          </td>
                          <td className="px-6 py-4 text-white/60">{item.available_quantity.toLocaleString()} {item.unit}</td>
                          <td className="px-6 py-4">
                            <Badge tone="danger">{`${item.shortfall.toLocaleString()} ${item.unit}`}</Badge>
                          </td>
                          <td className="px-6 py-4">
                            <Badge tone={item.fully_covered ? 'success' : 'danger'}>
                              {item.fully_covered ? 'Fully covered' : 'Gap remains'}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {requirements.length > topRequirements.length && (
                <p className="px-6 pb-4 text-xs text-white/40">
                  +{requirements.length - topRequirements.length} more on the full requirements plan.
                </p>
              )}
            </GlassCard>
          </div>

          <div>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-lg font-medium text-white">Awaiting quality check</h2>
              <Link to="/qc-requests" className="text-sm text-gold-300 hover:text-gold-200">
                All QC requests →
              </Link>
            </div>
            <GlassCard className="min-w-0 overflow-hidden">
              {qcLoading ? (
                <div className="flex justify-center py-12">
                  <Spinner size={24} className="text-gold-300" />
                </div>
              ) : topQc.length === 0 ? (
                <EmptyState title="Nothing pending" message="No production output is currently awaiting external QC." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-white/10 text-xs tracking-wide text-white/40 uppercase">
                        <th className="px-6 py-4 font-medium">Request</th>
                        <th className="px-6 py-4 font-medium">Product</th>
                        <th className="px-6 py-4 font-medium">Production order</th>
                        <th className="px-6 py-4 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topQc.map((qc) => (
                        <tr key={qc.id} className="border-b border-white/5 last:border-0">
                          <td className="px-6 py-4">
                            <Link to={`/production-orders/${qc.production_order_id}`} className="font-medium text-gold-300 hover:text-gold-200">
                              {qc.qc_request_number}
                            </Link>
                          </td>
                          <td className="px-6 py-4 text-white">
                            {qc.product_code ? `${qc.product_code} — ${qc.product_name}` : (qc.product_name ?? `#${qc.product_id}`)}
                          </td>
                          <td className="px-6 py-4 text-white/60">{qc.production_order_number ?? `#${qc.production_order_id}`}</td>
                          <td className="px-6 py-4">
                            <StatusBadge status={qc.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {qcRequests.length > topQc.length && (
                <p className="px-6 pb-4 text-xs text-white/40">
                  +{qcRequests.length - topQc.length} more awaiting QC not shown here.
                </p>
              )}
            </GlassCard>
          </div>
        </div>

        <div>
          <h2 className="mb-4 font-display text-lg font-medium text-white">Go to</h2>
          <div className="flex flex-col gap-2">
            <Link to="/production-orders">
              <Button variant="ghost" className="w-full justify-start">Production orders</Button>
            </Link>
            <Link to="/production">
              <Button variant="ghost" className="w-full justify-start">Production schedule</Button>
            </Link>
            <Link to="/mrp">
              <Button variant="ghost" className="w-full justify-start">Material requirements</Button>
            </Link>
            <Link to="/qc-requests">
              <Button variant="ghost" className="w-full justify-start">Quality check</Button>
            </Link>
            <Link to="/machines">
              <Button variant="ghost" className="w-full justify-start">Production line (machines)</Button>
            </Link>
            <Link to="/reconciliation">
              <Button variant="ghost" className="w-full justify-start">Reconciliation</Button>
            </Link>
            <Link to="/reports/production-report">
              <Button variant="ghost" className="w-full justify-start">Production report</Button>
            </Link>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
