import { forwardRef, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert, Button, EmptyState, GlassCard, Pagination, Spinner, StatusBadge } from '@/components/ui'
import { getSalesDrilldown } from '@/api/reports'
import type { SalesDrilldownParams } from '@/api/reports'
import { useClientPagination } from '@/hooks/useClientPagination'
import { getApiErrorMessage } from '@/lib/apiError'
import { CURRENCY_CODE, formatCurrency } from '@/lib/currency'
import { formatDate } from '@/lib/dateFormat'
import type { SalesDrilldownOrder } from '@/types/reports'

// Orders in these statuses were never placed / never happened, so the
// report leaves them out of revenue (backend REVENUE_STATUSES).
const NOT_REVENUE = ['draft', 'cancelled']
// The most rows the drill-down endpoint returns.
const DRILLDOWN_CAP = 200

/**
 * Inline drill-down showing the orders behind one point on a Sales
 * dashboard chart -- a month, a top customer or a top product -- each
 * linking to its order. Sits under the dashboard rather than in a modal and
 * stays until it is closed or another point is picked.
 */
export const OrdersDrilldown = forwardRef<
  HTMLDivElement,
  {
    title: string
    /** One line under the title -- what the chart point shows. */
    summary: string
    params: SalesDrilldownParams
    /** How many orders the point is known to cover, when the report says. */
    expectedCount?: number | null
    /** Strike through draft/cancelled totals (for lists that include them). */
    markNonRevenue?: boolean
    /** Extra explanatory line under the table. */
    note?: string
    onClose: () => void
  }
>(function OrdersDrilldown({ title, summary, params, expectedCount = null, markNonRevenue = false, note, onClose }, ref) {
  const [orders, setOrders] = useState<SalesDrilldownOrder[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const paramsKey = JSON.stringify(params)
  const pager = useClientPagination(orders, { resetKey: paramsKey })

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setOrders(null)
    getSalesDrilldown(JSON.parse(paramsKey) as SalesDrilldownParams)
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
  }, [paramsKey])

  const shown = orders?.length ?? 0
  const hasExcluded = markNonRevenue && (orders?.some((o) => NOT_REVENUE.includes(o.status)) ?? false)
  const truncated = shown > 0 && (expectedCount !== null ? shown < expectedCount : shown >= DRILLDOWN_CAP)

  return (
    <GlassCard ref={ref} className="scroll-mt-24 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-3.5">
        <div>
          <h2 className="font-display text-base font-medium text-white">{title}</h2>
          <p className="mt-0.5 text-xs text-white/40">{summary}</p>
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
        <EmptyState title="No orders found" message="Nothing matches this drill-down." />
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
                  const counted = !markNonRevenue || !NOT_REVENUE.includes(o.status)
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
          {(hasExcluded || truncated || note) && (
            <p className="px-5 pt-3 text-xs text-white/45">
              {note && `${note} `}
              {hasExcluded &&
                `Struck-through totals are draft or cancelled orders — not counted in revenue (${CURRENCY_CODE}). `}
              {truncated && (
                <>
                  Showing the {shown} most recent{expectedCount !== null ? ` of ${expectedCount}` : ''} orders.{' '}
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
})
