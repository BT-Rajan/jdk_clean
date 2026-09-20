import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { Alert, EmptyState, GlassCard, PageHeader, Pagination, Spinner, StatusBadge } from '@/components/ui'
import { StatsWidget } from '@/components/dashboard/DashboardWidgets'
import { listNotifications } from '@/api/notifications'
import { listCustomers } from '@/api/customers'
import { listFeasibilities } from '@/api/feasibilities'
import { listQuotations } from '@/api/quotations'
import { listOrders } from '@/api/orders'
import type { Notification, NotificationSeverity } from '@/types/notification'
import type { Feasibility, FeasibilityStatus } from '@/types/feasibility'
import type { Quotation, QuotationStatus } from '@/types/quotation'
import type { Order, OrderStatus } from '@/types/order'
import { useClientPagination } from '@/hooks/useClientPagination'
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

// Sales' own slice of the same live notification feed the header bell and
// the main Dashboard already show (GET /api/notifications) -- not a
// separate to-do system. Matched by link prefix (mirrors
// PurchasingHomePage's isPurchasingNotification) rather than type, so it
// automatically picks up every notification that lands on a Sales-owned
// record -- including a discount-approval item on a quotation/order --
// without needing to enumerate every notification type by hand.
function isSalesNotification(n: Notification): boolean {
  return (
    n.link.startsWith('/feasibilities/') ||
    n.link.startsWith('/quotations/') ||
    n.link.startsWith('/orders/') ||
    n.link.startsWith('/customers/') ||
    n.link.startsWith('/delivery-notes/')
  )
}

// Not yet resolved one way or the other -- still needs a decision from
// Sales (feasible/exception_approved/etc. have already moved past this).
const PENDING_FEASIBILITY_STATUSES: FeasibilityStatus[] = ['draft', 'exception_pending']
// Drafted or sent but not yet accepted/rejected/expired/converted --
// still something for Sales to act on.
const OPEN_QUOTATION_STATUSES: QuotationStatus[] = ['draft', 'sent']
// Mirrors dashboard_service.py's ORDER_OPEN_STATUSES -- every status still
// in flight; delivered/cancelled are done, not a position to report on.
const OPEN_ORDER_STATUSES: OrderStatus[] = ['draft', 'confirmed', 'in_production', 'ready_to_ship', 'shipped']

export function SalesHomePage() {
  const [error, setError] = useState<string | null>(null)

  const [customersTotal, setCustomersTotal] = useState<number | null>(null)
  const [customersLoading, setCustomersLoading] = useState(true)

  const [notifications, setNotifications] = useState<Notification[]>([])
  const [notifLoading, setNotifLoading] = useState(true)

  const [feasibilities, setFeasibilities] = useState<Feasibility[]>([])
  const [feasibilitiesLoading, setFeasibilitiesLoading] = useState(true)

  const [quotations, setQuotations] = useState<Quotation[]>([])
  const [quotationsLoading, setQuotationsLoading] = useState(true)

  const [orders, setOrders] = useState<Order[]>([])
  const [ordersLoading, setOrdersLoading] = useState(true)

  useEffect(() => {
    listCustomers({ page: 1, page_size: 1 })
      .then((res) => setCustomersTotal(res.total))
      .catch((err) => setError(getApiErrorMessage(err)))
      .finally(() => setCustomersLoading(false))
    listNotifications()
      .then((res) => setNotifications(res.items))
      .catch(() => setNotifications([]))
      .finally(() => setNotifLoading(false))
    // Unfiltered (page_size covers realistic volumes, same reasoning as
    // PurchasingHomePage's own open-purchase-orders fetch) and sorted/
    // filtered client-side -- the backend's status filter only takes one
    // value at a time, and "still open" spans several statuses at once.
    listFeasibilities({ page: 1, page_size: 100 })
      .then((result) => setFeasibilities(result.items))
      .catch(() => setFeasibilities([]))
      .finally(() => setFeasibilitiesLoading(false))
    listQuotations({ page: 1, page_size: 100 })
      .then((result) => setQuotations(result.items))
      .catch(() => setQuotations([]))
      .finally(() => setQuotationsLoading(false))
    listOrders({ page: 1, page_size: 100 })
      .then((result) => setOrders(result.items))
      .catch(() => setOrders([]))
      .finally(() => setOrdersLoading(false))
  }, [])

  const salesNotifications = useMemo(
    () =>
      notifications
        .filter(isSalesNotification)
        .sort((a, b) => severityRank[a.severity] - severityRank[b.severity] || (a.created_at < b.created_at ? 1 : -1)),
    [notifications],
  )

  const pendingFeasibilities = feasibilities.filter((f) => PENDING_FEASIBILITY_STATUSES.includes(f.status))

  const openQuotations = useMemo(
    () => quotations.filter((q) => OPEN_QUOTATION_STATUSES.includes(q.status)),
    [quotations],
  )
  const sortedQuotations = useMemo(
    () =>
      [...openQuotations]
        .sort((a, b) => (a.quotation_date < b.quotation_date ? 1 : -1)),
    [openQuotations],
  )

  const openOrders = useMemo(() => orders.filter((o) => OPEN_ORDER_STATUSES.includes(o.status)), [orders])
  const sortedOrders = useMemo(
    () =>
      [...openOrders]
        .sort((a, b) => {
          const aDate = a.confirmed_delivery_date ?? a.requested_delivery_date
          const bDate = b.confirmed_delivery_date ?? b.requested_delivery_date
          if (!aDate) return 1
          if (!bDate) return -1
          return aDate.localeCompare(bDate)
        }),
    [openOrders],
  )

  const notificationsPager = useClientPagination(salesNotifications)
  const quotationsPager = useClientPagination(sortedQuotations)
  const ordersPager = useClientPagination(sortedOrders)

  return (
    <AppLayout>
      <PageHeader
        title="Sales"
        subtitle="From feasibility check through quotation, order, and delivery — what's moving and what needs a decision."
      />

      <Alert variant="error">{error}</Alert>

      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatsWidget title="Customers" value={customersLoading ? '—' : (customersTotal ?? '—')} to="/customers" />
        <StatsWidget
          title="Feasibility checks pending"
          value={feasibilitiesLoading ? '—' : pendingFeasibilities.length}
          to="/feasibilities"
        />
        <StatsWidget title="Open quotations" value={quotationsLoading ? '—' : openQuotations.length} to="/quotations" />
        <StatsWidget title="Open orders" value={ordersLoading ? '—' : openOrders.length} to="/orders" />
      </div>

      <div className="grid min-w-0 gap-6">
        <div className="min-w-0 flex flex-col gap-8">
          <div>
            <h2 className="mb-4 font-display text-lg font-medium text-white">Needs attention</h2>
            {notifLoading ? (
              <GlassCard className="p-6 text-sm text-white/40">Loading…</GlassCard>
            ) : salesNotifications.length === 0 ? (
              <GlassCard className="p-6 text-sm text-white/50">Nothing in Sales needs action right now.</GlassCard>
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
              <h2 className="font-display text-lg font-medium text-white">Quotations awaiting action</h2>
              <Link to="/quotations" className="text-sm text-gold-300 hover:text-gold-200">
                All quotations →
              </Link>
            </div>
            <GlassCard className="min-w-0 overflow-hidden">
              {quotationsLoading ? (
                <div className="flex justify-center py-12">
                  <Spinner size={24} className="text-gold-300" />
                </div>
              ) : sortedQuotations.length === 0 ? (
                <EmptyState title="Nothing waiting" message="No quotation is currently in draft or sent." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-white/10 text-xs tracking-wide text-white/40 uppercase">
                        <th className="px-6 py-4 font-medium">Quotation</th>
                        <th className="px-6 py-4 font-medium">Customer</th>
                        <th className="px-6 py-4 font-medium">Valid until</th>
                        <th className="px-6 py-4 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {quotationsPager.pageItems.map((q) => (
                        <tr key={q.id} className="border-b border-white/5 last:border-0">
                          <td className="px-6 py-4">
                            <Link to={`/quotations/${q.id}`} className="font-medium text-gold-300 hover:text-gold-200">
                              {q.quotation_number}
                            </Link>
                          </td>
                          <td className="px-6 py-4 text-white/60">{q.customer_name ?? `#${q.customer_id}`}</td>
                          <td className="px-6 py-4 text-white/60">{formatDate(q.valid_until)}</td>
                          <td className="px-6 py-4">
                            <StatusBadge status={q.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <Pagination className="px-6 pb-4" {...quotationsPager.pagerProps} />
            </GlassCard>
          </div>

          <div>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-lg font-medium text-white">Orders in progress</h2>
              <Link to="/orders" className="text-sm text-gold-300 hover:text-gold-200">
                All orders →
              </Link>
            </div>
            <GlassCard className="min-w-0 overflow-hidden">
              {ordersLoading ? (
                <div className="flex justify-center py-12">
                  <Spinner size={24} className="text-gold-300" />
                </div>
              ) : sortedOrders.length === 0 ? (
                <EmptyState title="Nothing open" message="No order is currently in progress." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-white/10 text-xs tracking-wide text-white/40 uppercase">
                        <th className="px-6 py-4 font-medium">Order</th>
                        <th className="px-6 py-4 font-medium">Customer</th>
                        <th className="px-6 py-4 font-medium">Delivery</th>
                        <th className="px-6 py-4 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ordersPager.pageItems.map((o) => (
                        <tr key={o.id} className="border-b border-white/5 last:border-0">
                          <td className="px-6 py-4">
                            <Link to={`/orders/${o.id}`} className="font-medium text-gold-300 hover:text-gold-200">
                              {o.order_number}
                            </Link>
                          </td>
                          <td className="px-6 py-4 text-white/60">{o.customer_name ?? `#${o.customer_id}`}</td>
                          <td className="px-6 py-4 text-white/60">
                            {formatDate(o.confirmed_delivery_date ?? o.requested_delivery_date)}
                          </td>
                          <td className="px-6 py-4">
                            <StatusBadge status={o.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <Pagination className="px-6 pb-4" {...ordersPager.pagerProps} />
            </GlassCard>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
