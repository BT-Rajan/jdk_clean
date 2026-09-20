import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { Alert, Badge, EmptyState, GlassCard, PageHeader, Pagination, Spinner, StatusBadge } from '@/components/ui'
import { StatsWidget } from '@/components/dashboard/DashboardWidgets'
import { getDashboardStats } from '@/api/dashboard'
import { listNotifications } from '@/api/notifications'
import { getMrpReport } from '@/api/mrp'
import { listPurchaseOrders } from '@/api/purchaseOrders'
import type { DashboardStatsResponse } from '@/types/dashboard'
import type { Notification, NotificationSeverity } from '@/types/notification'
import type { MrpRequirementLine } from '@/types/mrp'
import type { PurchaseOrder, PurchaseOrderStatus } from '@/types/purchaseOrder'
import { useClientPagination } from '@/hooks/useClientPagination'
import { getApiErrorMessage } from '@/lib/apiError'
import { formatDate } from '@/lib/dateFormat'

// Same severity styling the main Dashboard's Needs Attention section
// uses (see DashboardPage.tsx) -- kept in sync deliberately so an item
// reads the same way in both places, not a second notification design.
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

// Purchasing's own slice of the same live notification feed the header
// bell and the main Dashboard already show (GET /api/notifications) --
// not a separate to-do system. See notification_service.py for what
// each type means: low_stock is a raw material at/below its reorder
// point, the purchase_order_* types are POs needing review/approval,
// and a discount-approval item is scoped to purchasing only when it
// links at a purchase order.
function isPurchasingNotification(n: Notification): boolean {
  return n.type === 'low_stock' || n.type.startsWith('purchase_order_') || n.link.startsWith('/purchase-orders/')
}

const OPEN_PO_STATUSES: PurchaseOrderStatus[] = ['sent', 'confirmed', 'partially_received']

export function PurchasingHomePage() {
  const [stats, setStats] = useState<DashboardStatsResponse | null>(null)
  const [statsLoading, setStatsLoading] = useState(true)
  const [statsError, setStatsError] = useState<string | null>(null)

  const [notifications, setNotifications] = useState<Notification[]>([])
  const [notifLoading, setNotifLoading] = useState(true)

  const [requirements, setRequirements] = useState<MrpRequirementLine[]>([])
  const [requirementsLoading, setRequirementsLoading] = useState(true)

  const [openOrders, setOpenOrders] = useState<PurchaseOrder[]>([])
  const [openOrdersLoading, setOpenOrdersLoading] = useState(true)

  useEffect(() => {
    getDashboardStats()
      .then(setStats)
      .catch((err) => setStatsError(getApiErrorMessage(err)))
      .finally(() => setStatsLoading(false))
    listNotifications()
      .then((res) => setNotifications(res.items))
      .catch(() => setNotifications([]))
      .finally(() => setNotifLoading(false))
    getMrpReport()
      .then((report) => setRequirements(report.items))
      .catch(() => setRequirements([]))
      .finally(() => setRequirementsLoading(false))
    // Unfiltered (page_size covers realistic PO volumes) and sorted
    // client-side by expected delivery -- the backend's status filter
    // only takes one value at a time, and "what's already coming" spans
    // three statuses (sent/confirmed/partially_received) at once.
    listPurchaseOrders({ page: 1, page_size: 100 })
      .then((result) => setOpenOrders(result.items))
      .catch(() => setOpenOrders([]))
      .finally(() => setOpenOrdersLoading(false))
  }, [])

  const purchasingNotifications = useMemo(
    () =>
      notifications
        .filter(isPurchasingNotification)
        .sort((a, b) => severityRank[a.severity] - severityRank[b.severity] || (a.created_at < b.created_at ? 1 : -1)),
    [notifications],
  )

  const sortedRequirements = useMemo(() => [...requirements].sort((a, b) => b.shortfall - a.shortfall), [requirements])

  const sortedOpenOrders = useMemo(
    () =>
      openOrders
        .filter((po) => OPEN_PO_STATUSES.includes(po.status))
        .sort((a, b) => {
          if (!a.expected_delivery_date) return 1
          if (!b.expected_delivery_date) return -1
          return a.expected_delivery_date.localeCompare(b.expected_delivery_date)
        }),
    [openOrders],
  )

  const notificationsPager = useClientPagination(purchasingNotifications)
  const requirementsPager = useClientPagination(sortedRequirements)
  const openOrdersPager = useClientPagination(sortedOpenOrders)

  return (
    <AppLayout>
      <PageHeader
        title="Purchasing"
        subtitle="Raw-material stock position first — what's on hand, what's already coming, and what that leaves to buy."
      />

      <Alert variant="error">{statsError}</Alert>

      {!statsLoading && stats && (
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatsWidget title="Raw materials" value={stats.stats.raw_materials_count?.value ?? '—'} to="/raw-materials" />
          <StatsWidget title="Low on stock" value={stats.stats.low_stock_count?.value ?? '—'} to="/inventory" />
          <StatsWidget title="Suppliers" value={stats.stats.suppliers_count?.value ?? '—'} to="/suppliers" />
          <StatsWidget title="Open purchase orders" value={stats.stats.purchase_orders_pending?.value ?? '—'} to="/purchase-orders" />
        </div>
      )}
      {statsLoading && (
        <div className="mb-8 flex justify-center py-8">
          <Spinner size={24} className="text-gold-300" />
        </div>
      )}

      <div className="grid min-w-0 gap-6">
        <div className="min-w-0 flex flex-col gap-8">
          <div>
            <h2 className="mb-4 font-display text-lg font-medium text-white">Needs attention</h2>
            {notifLoading ? (
              <GlassCard className="p-6 text-sm text-white/40">Loading…</GlassCard>
            ) : purchasingNotifications.length === 0 ? (
              <GlassCard className="p-6 text-sm text-white/50">Nothing in purchasing needs action right now.</GlassCard>
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
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-lg font-medium text-white">What else is required</h2>
              <Link to="/mrp" className="text-sm text-gold-300 hover:text-gold-200">
                Full requirements plan →
              </Link>
            </div>
            <GlassCard className="min-w-0 overflow-hidden">
              {requirementsLoading ? (
                <div className="flex justify-center py-12">
                  <Spinner size={24} className="text-gold-300" />
                </div>
              ) : sortedRequirements.length === 0 ? (
                <EmptyState
                  title="No shortfalls"
                  message="Everything currently on order and scheduled for production can be covered by stock on hand."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-white/10 text-xs tracking-wide text-white/40 uppercase">
                        <th className="px-6 py-4 font-medium">Material</th>
                        <th className="px-6 py-4 font-medium">On hand</th>
                        <th className="px-6 py-4 font-medium">Shortfall</th>
                        <th className="px-6 py-4 font-medium">Coverage</th>
                      </tr>
                    </thead>
                    <tbody>
                      {requirementsPager.pageItems.map((item) => (
                        <tr key={item.raw_material_id} className="border-b border-white/5 last:border-0">
                          <td className="px-6 py-4">
                            <Link to={`/raw-materials/${item.raw_material_id}`} className="font-medium text-gold-300 hover:text-gold-200">
                              {item.code} — {item.name}
                            </Link>
                          </td>
                          <td className="px-6 py-4 text-white/60">{item.current_on_hand.toLocaleString()} {item.unit}</td>
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
              <Pagination className="px-6 pb-4" {...requirementsPager.pagerProps} />
            </GlassCard>
          </div>

          <div>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-lg font-medium text-white">What's already coming</h2>
              <Link to="/purchase-orders" className="text-sm text-gold-300 hover:text-gold-200">
                All purchase orders →
              </Link>
            </div>
            <GlassCard className="min-w-0 overflow-hidden">
              {openOrdersLoading ? (
                <div className="flex justify-center py-12">
                  <Spinner size={24} className="text-gold-300" />
                </div>
              ) : sortedOpenOrders.length === 0 ? (
                <EmptyState title="Nothing open" message="No purchase order is currently sent, confirmed, or partially received." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-white/10 text-xs tracking-wide text-white/40 uppercase">
                        <th className="px-6 py-4 font-medium">Purchase order</th>
                        <th className="px-6 py-4 font-medium">Supplier</th>
                        <th className="px-6 py-4 font-medium">Expected</th>
                        <th className="px-6 py-4 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {openOrdersPager.pageItems.map((po) => (
                        <tr key={po.id} className="border-b border-white/5 last:border-0">
                          <td className="px-6 py-4">
                            <Link to={`/purchase-orders/${po.id}`} className="font-medium text-gold-300 hover:text-gold-200">
                              {po.po_number}
                            </Link>
                          </td>
                          <td className="px-6 py-4 text-white/60">{po.supplier_name ?? `#${po.supplier_id}`}</td>
                          <td className="px-6 py-4 text-white/60">{formatDate(po.expected_delivery_date)}</td>
                          <td className="px-6 py-4">
                            <StatusBadge status={po.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <Pagination className="px-6 pb-4" {...openOrdersPager.pagerProps} />
            </GlassCard>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
