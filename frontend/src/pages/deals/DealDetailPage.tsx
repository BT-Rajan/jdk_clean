import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { Alert, GlassCard, PageHeader, Spinner, StatusBadge } from '@/components/ui'
import { getDeal } from '@/api/deals'
import type { DealDetail } from '@/types/deal'
import { getApiErrorMessage } from '@/lib/apiError'
import { formatCurrency } from '@/lib/currency'
import { formatDateTime } from '@/lib/dateFormat'

const STAGE_LABELS: Record<string, string> = {
  feasibility: 'Feasibility',
  quotation: 'Quotation',
  order: 'Order',
  production: 'Production',
  delivery: 'Delivery',
}

function Section({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  if (count === 0) return null
  return (
    <GlassCard className="p-6">
      <h2 className="mb-4 font-display text-base font-medium text-white">
        {title} <span className="text-sm text-white/40">({count})</span>
      </h2>
      <div className="space-y-2">{children}</div>
    </GlassCard>
  )
}

// A deal is a loose grouping (see deal_service.py) -- unlike Order
// Journey, which traces one order's single chain, this shows everything
// that's happened under one customer request: potentially more than one
// feasibility check or quotation (e.g. a re-quote), not just a fixed
// sequence.
export function DealDetailPage() {
  const { id } = useParams()
  const dealId = Number(id)

  const [deal, setDeal] = useState<DealDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getDeal(dealId)
      .then(setDeal)
      .catch((err) => setError(getApiErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [dealId])

  if (loading) {
    return (
      <AppLayout>
        <div className="flex justify-center py-24">
          <Spinner size={28} className="text-gold-300" />
        </div>
      </AppLayout>
    )
  }

  if (!deal) {
    return (
      <AppLayout>
        <Alert variant="error">{error ?? 'Deal not found.'}</Alert>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <PageHeader title={deal.deal_number} subtitle={deal.customer_name ?? undefined} />

      <GlassCard className="mb-6 p-6">
        <div className="flex flex-wrap items-center gap-3">
          {deal.status === 'cancelled' && (
            <span className="rounded-full border border-red-400/30 bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-300">
              Cancelled
            </span>
          )}
          <span className="text-sm text-white/50">Furthest stage reached:</span>
          <StatusBadge status={STAGE_LABELS[deal.furthest_stage] ?? deal.furthest_stage} />
          <span className="text-xs text-white/30">Started {formatDateTime(deal.created_at)}</span>
        </div>
      </GlassCard>

      <div className="flex flex-col gap-6">
        <Section title="Feasibility checks" count={deal.feasibility_checks.length}>
          {deal.feasibility_checks.map((f) => (
            <Link
              key={f.id}
              to={`/feasibilities/${f.id}`}
              className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-4 py-3 hover:border-white/20"
            >
              <span className="font-medium text-white">{f.feasibility_number}</span>
              <StatusBadge status={f.status} />
            </Link>
          ))}
        </Section>

        <Section title="Quotations" count={deal.quotations.length}>
          {deal.quotations.map((q) => (
            <Link
              key={q.id}
              to={`/quotations/${q.id}`}
              className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-4 py-3 hover:border-white/20"
            >
              <span className="flex items-center gap-2 font-medium text-white">
                {q.quotation_number}
                {q.auto_created && (
                  <span className="rounded-full border border-gold-400/30 bg-gold-500/10 px-2 py-0.5 text-xs font-medium text-gold-200">
                    Auto-created
                  </span>
                )}
              </span>
              <span className="flex items-center gap-3">
                <span className="text-sm text-white/40">{formatCurrency(q.total_amount)}</span>
                <StatusBadge status={q.status} />
              </span>
            </Link>
          ))}
        </Section>

        <Section title="Orders" count={deal.orders.length}>
          {deal.orders.map((o) => (
            <Link
              key={o.id}
              to={`/orders/${o.id}`}
              className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-4 py-3 hover:border-white/20"
            >
              <span className="font-medium text-white">{o.order_number}</span>
              <span className="flex items-center gap-3">
                <span className="text-sm text-white/40">{formatCurrency(o.total_amount)}</span>
                <StatusBadge status={o.status} />
              </span>
            </Link>
          ))}
        </Section>

        <Section title="Production batches" count={deal.production_batches.length}>
          {deal.production_batches.map((b) => (
            <div
              key={b.id}
              className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-4 py-3"
            >
              <span className="font-medium text-white">
                {b.batch_number} <span className="text-white/40">— {b.product_name}</span>
              </span>
              <StatusBadge status={b.status} />
            </div>
          ))}
        </Section>

        <Section title="Delivery notes" count={deal.delivery_notes.length}>
          {deal.delivery_notes.map((d) => (
            <Link
              key={d.id}
              to={`/delivery-notes/${d.id}`}
              className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-4 py-3 hover:border-white/20"
            >
              <span className="font-medium text-white">{d.delivery_note_number}</span>
              <StatusBadge status={d.status} />
            </Link>
          ))}
        </Section>
      </div>
    </AppLayout>
  )
}
