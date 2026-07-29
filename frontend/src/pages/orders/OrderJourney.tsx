import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { GlassCard, Spinner, StatusBadge } from '@/components/ui'
import { getOrderJourney } from '@/api/orders'
import type { OrderJourney as OrderJourneyData } from '@/types/orderJourney'
import { getApiErrorMessage } from '@/lib/apiError'

interface OrderJourneyProps {
  orderId: number
}

interface StageProps {
  label: string
  reached: boolean
  children: ReactNode
}

function Stage({ label, reached, children }: StageProps) {
  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 ${
            reached ? 'border-gold-400 bg-gold-500/20' : 'border-white/15 bg-white/5'
          }`}
        >
          <div className={`h-2.5 w-2.5 rounded-full ${reached ? 'bg-gold-300' : 'bg-white/20'}`} />
        </div>
        <div className={`mt-1 w-px flex-1 ${reached ? 'bg-gold-400/30' : 'bg-white/10'}`} />
      </div>
      <div className="flex-1 pb-8">
        <p className="text-xs font-medium tracking-wide text-white/40 uppercase">{label}</p>
        <div className="mt-2">{children}</div>
      </div>
    </div>
  )
}

// Answers "where is this order right now" in one place: the feasibility
// check it came from, the quotation raised on it, the order itself, every
// production batch scheduled against it, and every delivery note issued
// for it -- traced live off the real foreign keys between those tables
// (see GET /api/orders/{id}/journey), not a separately maintained status.
export function OrderJourney({ orderId }: OrderJourneyProps) {
  const [journey, setJourney] = useState<OrderJourneyData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getOrderJourney(orderId)
      .then(setJourney)
      .catch((err) => setError(getApiErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [orderId])

  if (loading) {
    return (
      <GlassCard className="p-8">
        <div className="flex justify-center py-4">
          <Spinner size={20} className="text-gold-300" />
        </div>
      </GlassCard>
    )
  }

  if (error || !journey) {
    return (
      <GlassCard className="p-8">
        <p className="text-sm text-red-300">{error ?? 'Could not load this order\'s journey.'}</p>
      </GlassCard>
    )
  }

  const { feasibility, quotation, order, production_batches, delivery_notes } = journey

  return (
    <GlassCard className="p-8">
      <h2 className="mb-6 font-display text-lg font-medium text-white">Order journey</h2>

      <div>
        <Stage label="Feasibility" reached={feasibility !== null}>
          {feasibility ? (
            <Link to={`/feasibilities/${feasibility.id}`} className="group flex items-center gap-2">
              <span className="font-medium text-gold-300 group-hover:text-gold-200">
                {feasibility.feasibility_number}
              </span>
              <StatusBadge status={feasibility.status} />
            </Link>
          ) : (
            <p className="text-sm text-white/40">No feasibility check on record for this order.</p>
          )}
        </Stage>

        <Stage label="Quotation" reached={quotation !== null}>
          {quotation ? (
            <Link to={`/quotations/${quotation.id}`} className="group flex items-center gap-2">
              <span className="font-medium text-gold-300 group-hover:text-gold-200">
                {quotation.quotation_number}
              </span>
              <StatusBadge status={quotation.status} />
              <span className="text-sm text-white/40">₹{quotation.total_amount.toLocaleString()}</span>
            </Link>
          ) : (
            <p className="text-sm text-white/40">This order wasn't converted from a quotation.</p>
          )}
        </Stage>

        <Stage label="Order" reached>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-white">{order.order_number}</span>
            <StatusBadge status={order.status} />
            {order.admin_review_required && <StatusBadge status="overdue" className="border-amber-400/30 bg-amber-500/10 text-amber-200" />}
          </div>
          <p className="mt-1 text-sm text-white/40">
            {order.customer_name} · ₹{order.total_amount.toLocaleString()}
            {order.confirmed_delivery_date && ` · due ${new Date(order.confirmed_delivery_date).toLocaleDateString()}`}
          </p>
        </Stage>

        <Stage label="Production" reached={production_batches.length > 0}>
          {production_batches.length > 0 ? (
            <div className="space-y-2">
              {production_batches.map((b) => (
                <div key={b.id} className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-white">{b.batch_number}</span>
                  <StatusBadge status={b.status} />
                  <span className="text-sm text-white/40">
                    {b.product_name}
                    {b.machine_name && ` on ${b.machine_name}`} · {b.produced_quantity}/{b.planned_quantity} done ·{' '}
                    {new Date(b.scheduled_start).toLocaleDateString()} – {new Date(b.scheduled_end).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-white/40">No production batch scheduled against this order yet.</p>
          )}
        </Stage>

        <div className="flex gap-4">
          <div className="flex flex-col items-center">
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 ${
                delivery_notes.length > 0 ? 'border-gold-400 bg-gold-500/20' : 'border-white/15 bg-white/5'
              }`}
            >
              <div className={`h-2.5 w-2.5 rounded-full ${delivery_notes.length > 0 ? 'bg-gold-300' : 'bg-white/20'}`} />
            </div>
          </div>
          <div className="flex-1">
            <p className="text-xs font-medium tracking-wide text-white/40 uppercase">Delivery</p>
            <div className="mt-2">
              {delivery_notes.length > 0 ? (
                <div className="space-y-2">
                  {delivery_notes.map((d) => (
                    <div key={d.id} className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-white">{d.delivery_note_number}</span>
                      <StatusBadge status={d.status} />
                      <span className="text-sm text-white/40">{new Date(d.delivery_date).toLocaleDateString()}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-white/40">No delivery note issued yet.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </GlassCard>
  )
}
