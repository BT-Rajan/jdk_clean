import { forwardRef, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert, Button, EmptyState, GlassCard, Pagination, Spinner, StatusBadge } from '@/components/ui'
import { getSalesDrilldown } from '@/api/reports'
import { useClientPagination } from '@/hooks/useClientPagination'
import { getApiErrorMessage } from '@/lib/apiError'
import { CURRENCY_CODE, formatCurrency } from '@/lib/currency'
import { formatDate } from '@/lib/dateFormat'
import type { SalesDrilldownOrder, SalesReportMonthly } from '@/types/reports'

// Orders in these statuses were never placed / never happened, so the
// report leaves them out of a month's revenue (backend REVENUE_STATUSES).
const NOT_REVENUE = ['draft', 'cancelled']

/**
 * Inline drill-down for one point on the revenue trend: the orders placed
 * in that month, each linking to its order. Sits under the dashboard rather
 * than in a modal and stays until it is closed or another month is picked.
 */
export const MonthDrilldown = forwardRef<HTMLDivElement, { month: SalesReportMonthly; onClose: () => void }>(
  function MonthDrilldown({ month, onClose }, ref) {
    const [orders, setOrders] = useState<SalesDrilldownOrder[] | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const pager = useClientPagination(orders, { resetKey: `${month.year}-${month.month}` })

    useEffect(() => {
      let cancelled = false
      setLoading(true)
      setError(null)
      setOrders(null)
      getSalesDrilldown({ year: month.year, month: month.month })
        .then((res) => {
          if (!cancelled) setOrders(res.items)
        })
        .catch((err) => {
          if (!cancelled) setError(getApiErrorMessage(err))
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
      return () => {
        cancelled = true
      }
    }, [month.year, month.month])

    const shown = orders?.length ?? 0
    const hasExcluded = orders?.some((o) => NOT_REVENUE.includes(o.status)) ?? false

    return (
      <GlassCard ref={ref} className="scroll-mt-24 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-3.5">
          <div>
            <h2 className="font-display text-base font-medium text-white">Orders — {month.label}</h2>
            <p className="mt-0.5 text-xs text-white/40">
              {month.order_count} {month.order_count === 1 ? 'order' : 'orders'} · {formatCurrency(month.revenue)} revenue
              · drilled down from the revenue trend above
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>

        <Alert variant="error">{error}</Alert>
        {loading ? (
          <div className="flex justify-center py-10">
            <Spinner size={24} className="text-gold-300" />
          </div>
        ) : !orders || orders.length === 0 ? (
          <EmptyState title="No orders found" message="No orders were placed in this month." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-xs tracking-wide text-white/40 uppercase">
                    <th className="px-5 py-3 font-medium">Number</th>
                    <th className="px-5 py-3 font-medium">Customer</th>
                    <th className="px-5 py-3 font-medium">Date</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {pager.pageItems.map((o) => {
                    const counted = !NOT_REVENUE.includes(o.status)
                    return (
                      <tr key={o.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.03]">
                        <td className="px-5 py-3">
                          <Link to={`/orders/${o.id}`} className="font-medium text-gold-300 hover:text-gold-200">
                            {o.order_number}
                          </Link>
                        </td>
                        <td className="px-5 py-3 text-white">{o.customer_name ?? '—'}</td>
                        <td className="px-5 py-3 whitespace-nowrap text-white/60">{formatDate(o.order_date)}</td>
                        <td className="px-5 py-3">
                          <StatusBadge status={o.status} />
                        </td>
                        <td
                          className={`px-5 py-3 whitespace-nowrap ${counted ? 'text-white/60' : 'text-white/30 line-through'}`}
                        >
                          {formatCurrency(o.total_amount)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {(hasExcluded || shown < month.order_count) && (
              <p className="px-5 pt-3 text-xs text-white/45">
                {hasExcluded && `Struck-through totals are draft or cancelled orders — not counted in revenue (${CURRENCY_CODE}). `}
                {shown < month.order_count && (
                  <>
                    Showing the {shown} most recent of {month.order_count} orders.{' '}
                    <Link to="/orders" className="text-gold-300 hover:text-gold-200">
                      See all orders
                    </Link>
                    .
                  </>
                )}
              </p>
            )}
            <Pagination className="px-5 pb-4" {...pager.pagerProps} />
          </>
        )}
      </GlassCard>
    )
  },
)
