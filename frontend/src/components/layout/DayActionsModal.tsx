import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert, Modal, Spinner, StatusBadge } from '@/components/ui'
import { getDaySnapshot } from '@/api/calendar'
import type { DaySnapshot } from '@/types/calendar'
import { getApiErrorMessage } from '@/lib/apiError'
import { formatDate } from '@/lib/dateFormat'
import { formatCurrency } from '@/lib/currency'

interface DayActionsModalProps {
  open: boolean
  /** ISO date (YYYY-MM-DD) of the day that was clicked. */
  date: string
  onClose: () => void
  /** Called when a snapshot row -- or one of the "log a transaction"
   * links -- is clicked to go to its own page -- production/completed
   * batches and shipped orders can't be edited or undone from here
   * (both are deliberately terminal states once they've happened,
   * everywhere else in the app too); fixing a mistake means going to
   * that record's own page, same as everywhere else. */
  onNavigate: () => void
}

/** Opens the moment a day is clicked in the calendar: a snapshot of
 * what's already logged for that day (production, sales), plus links
 * straight to the actual Production, Orders, and Inventory pages to log
 * a new one -- no separate quick-log modal here, same as every other
 * create flow in the app. Each snapshot row links to its own detail
 * page for anything beyond viewing (see onNavigate above). */
export function DayActionsModal({ open, date, onClose, onNavigate }: DayActionsModalProps) {
  const [snapshot, setSnapshot] = useState<DaySnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    getDaySnapshot(date)
      .then((s) => {
        if (!cancelled) {
          setSnapshot(s)
          setError(null)
        }
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
  }, [open, date])

  const hasActivity = !!snapshot && (snapshot.production.length > 0 || snapshot.sales.length > 0)

  return (
    <Modal open={open} title={formatDate(date)} onClose={onClose}>
      <div className="flex flex-col gap-5">
        {loading ? (
          <div className="flex justify-center py-8">
            <Spinner size={20} className="text-gold-300" />
          </div>
        ) : error ? (
          <Alert variant="error">{error}</Alert>
        ) : (
          <div>
            <p className="mb-2 text-xs font-medium tracking-wide text-white/50 uppercase">Daily snapshot</p>
            {hasActivity ? (
              <div className="flex flex-col gap-2">
                {snapshot!.production.map((b) => (
                  <Link
                    key={`production-${b.id}`}
                    to={`/production/${b.id}`}
                    onClick={onNavigate}
                    className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm transition-colors hover:border-gold-400/30 hover:bg-white/[0.08]"
                  >
                    <span className="truncate text-white/80">
                      {b.product_code ? `${b.product_code} — ${b.product_name}` : `#${b.id}`}
                    </span>
                    <span className="flex shrink-0 items-center gap-2 text-xs text-white/50">
                      {b.status === 'completed' ? `${b.produced_quantity} produced` : `${b.planned_quantity} planned`}
                      <StatusBadge status={b.status} />
                    </span>
                  </Link>
                ))}
                {snapshot!.sales.map((o) => (
                  <Link
                    key={`sale-${o.id}`}
                    to={`/orders/${o.id}`}
                    onClick={onNavigate}
                    className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm transition-colors hover:border-gold-400/30 hover:bg-white/[0.08]"
                  >
                    <span className="truncate text-white/80">{o.order_number} — {o.customer_name ?? 'Unknown customer'}</span>
                    <span className="flex shrink-0 items-center gap-2 text-xs text-white/50">
                      {formatCurrency(o.total_amount)}
                      <StatusBadge status={o.status} />
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-sm text-white/40">Nothing logged for this day yet.</p>
            )}
          </div>
        )}

        <div>
          <p className="mb-2 text-xs font-medium tracking-wide text-white/50 uppercase">Log a transaction</p>
          <div className="flex gap-3">
            <Link
              to="/production/new"
              onClick={onNavigate}
              className="glass-inset flex h-9 flex-1 items-center justify-center rounded-xl px-4 text-xs font-medium tracking-wide text-gold-100 transition-colors hover:bg-white/10"
            >
              Log production
            </Link>
            <Link
              to="/orders?log=1"
              onClick={onNavigate}
              className="flex h-9 flex-1 items-center justify-center rounded-xl bg-gradient-to-b from-gold-300 to-gold-600 px-4 text-xs font-medium tracking-wide text-ink-950 shadow-glow-gold transition-colors hover:from-gold-200 hover:to-gold-500"
            >
              Log a sale
            </Link>
            <Link
              to="/inventory/adjust"
              onClick={onNavigate}
              className="glass-inset flex h-9 flex-1 items-center justify-center rounded-xl px-4 text-xs font-medium tracking-wide text-gold-100 transition-colors hover:bg-white/10"
            >
              Log materials
            </Link>
          </div>
        </div>
      </div>
    </Modal>
  )
}
