import { forwardRef } from 'react'
import { Link } from 'react-router-dom'
import { Button, EmptyState, GlassCard, Pagination, StatusBadge } from '@/components/ui'
import { useClientPagination } from '@/hooks/useClientPagination'
import { formatCurrency } from '@/lib/currency'
import { formatDate } from '@/lib/dateFormat'
import type { FunnelStage, FunnelStageRecords } from '@/pages/reports/salesReportModel'

/**
 * Inline drill-down for one sales funnel stage: the records that stage's
 * number was counted from, each linking to its own page. Sits under the
 * dashboard rather than in a modal, and stays until it is closed or another
 * stage is picked.
 */
export const FunnelDrilldown = forwardRef<
  HTMLDivElement,
  {
    stage: FunnelStage
    /** Null when the list behind this stage couldn't be loaded completely. */
    data: FunnelStageRecords | null
    rangeHint: string
    onClose: () => void
  }
>(function FunnelDrilldown({ stage, data, rangeHint, onClose }, ref) {
  const pager = useClientPagination(data?.records, { resetKey: stage.key })
  const showAmount = data?.records.some((r) => r.amount !== null) ?? false
  const showOrder = stage.key === 'orders'
  const shown = data?.records.length ?? 0

  return (
    <GlassCard ref={ref} className="scroll-mt-24 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-3.5">
        <div>
          <h2 className="font-display text-base font-medium text-white">
            {stage.label} — {stage.count}
          </h2>
          <p className="mt-0.5 text-xs text-white/40">
            {rangeHint}
            {stage.note ? ` · ${stage.note}` : ''} · drilled down from the funnel above
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>

      {!data ? (
        <EmptyState
          title="Couldn't load these records"
          message="The list behind this stage is unavailable or too large to show completely here."
        />
      ) : data.records.length === 0 ? (
        <EmptyState title={`No ${data.noun}s found`} message="Nothing in this range for this stage." />
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
                  {showAmount && <th className="px-5 py-3 font-medium">Total</th>}
                  {showOrder && <th className="px-5 py-3 font-medium">Order</th>}
                </tr>
              </thead>
              <tbody>
                {pager.pageItems.map((r) => (
                  <tr key={r.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.03]">
                    <td className="px-5 py-3">
                      <Link to={r.to} className="font-medium text-gold-300 hover:text-gold-200">
                        {r.number}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-white">{r.customer ?? '—'}</td>
                    <td className="px-5 py-3 whitespace-nowrap text-white/60">{formatDate(r.date)}</td>
                    <td className="px-5 py-3">
                      <StatusBadge status={r.status} />
                    </td>
                    {showAmount && (
                      <td className="px-5 py-3 whitespace-nowrap text-white/60">
                        {r.amount !== null ? formatCurrency(r.amount) : '—'}
                      </td>
                    )}
                    {showOrder && (
                      <td className="px-5 py-3">
                        {r.orderTo ? (
                          <Link to={r.orderTo} className="text-gold-300 hover:text-gold-200">
                            View order
                          </Link>
                        ) : (
                          <span className="text-white/40">—</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {shown !== stage.count && (
            <p className="px-5 pt-3 text-xs text-white/45">
              Showing {shown} of {stage.count} — the rest aren't in what this page loads.{' '}
              <Link to={data.listTo} className="text-gold-300 hover:text-gold-200">
                See the full list
              </Link>
              .
            </p>
          )}
          <Pagination className="px-5 pb-4" {...pager.pagerProps} />
        </>
      )}
    </GlassCard>
  )
})
