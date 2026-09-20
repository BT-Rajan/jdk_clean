import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { Alert, EmptyState, GlassCard, Spinner } from '@/components/ui'
import { listCollectionQueue } from '@/api/collectionQueue'
import type { CollectionQueueRow } from '@/types/payment'
import { getApiErrorMessage } from '@/lib/apiError'
import { formatDate } from '@/lib/dateFormat'
import { formatCurrency } from '@/lib/currency'

/** Finance's dedicated worklist: every order with an overdue, still-
 * outstanding (unacknowledged) balance -- see payment_service.
 * list_collection_queue. Sorted worst-overdue first. */
export function CollectionQueuePage() {
  const [rows, setRows] = useState<CollectionQueueRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listCollectionQueue()
      .then(setRows)
      .catch((err) => setError(getApiErrorMessage(err)))
  }, [])

  return (
    <AppLayout>
      <div className="mb-8">
        <h1 className="font-display text-3xl font-medium text-white">Collection queue</h1>
        <p className="mt-2 text-sm text-white/50">
          {rows ? `${rows.length} order(s) with an overdue outstanding balance` : 'Overdue customer payments'}
        </p>
      </div>

      <Alert variant="error">{error}</Alert>

      <GlassCard className="overflow-hidden">
        {rows === null ? (
          <div className="flex justify-center py-16">
            <Spinner size={24} className="text-gold-300" />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState title="Nothing overdue" message="No order currently has an overdue outstanding balance." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-xs tracking-wide text-white/40 uppercase">
                  <th className="px-6 py-4 font-medium">Order</th>
                  <th className="px-6 py-4 font-medium">Customer</th>
                  <th className="px-6 py-4 font-medium">Total</th>
                  <th className="px-6 py-4 font-medium">Acknowledged</th>
                  <th className="px-6 py-4 font-medium">Outstanding</th>
                  <th className="px-6 py-4 font-medium">Due</th>
                  <th className="px-6 py-4 font-medium">Overdue</th>
                  <th className="px-6 py-4 font-medium">Follow-up owner</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.order_id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.03]">
                    <td className="px-6 py-4">
                      <Link to={`/orders/${row.order_id}`} className="font-medium text-gold-300 hover:text-gold-200">
                        {row.order_number}
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-white">{row.customer_name}</td>
                    <td className="px-6 py-4 text-white/60">{formatCurrency(row.total_amount)}</td>
                    <td className="px-6 py-4 text-white/60">{formatCurrency(row.amount_acknowledged)}</td>
                    <td className="px-6 py-4 text-amber-300">{formatCurrency(row.outstanding_balance)}</td>
                    <td className="px-6 py-4 text-white/60">{formatDate(row.due_date)}</td>
                    <td className="px-6 py-4 text-red-300">{row.overdue_days} day(s)</td>
                    <td className="px-6 py-4 text-white/60">{row.payment_followup_owner_name ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>
    </AppLayout>
  )
}
