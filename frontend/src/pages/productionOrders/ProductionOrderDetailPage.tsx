import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { Alert, Badge, Field, GlassCard, PageHeader, Spinner, StatusBadge } from '@/components/ui'
import { getProductionOrder, updateProductionOrderStatus } from '@/api/productionOrders'
import { getOrder } from '@/api/orders'
import type { ProductionOrder } from '@/types/productionOrder'
import type { Order } from '@/types/order'
import { getApiErrorMessage } from '@/lib/apiError'
import { formatDate } from '@/lib/dateFormat'
import { HistoryTimeline } from '@/components/history/HistoryTimeline'
import { useAuth } from '@/hooks/useAuth'
import { canWriteDepartment } from '@/lib/roles'
import { PRODUCTION_ORDER_STATUSES_REQUIRING_REASON, PRODUCTION_ORDER_TRANSITIONS } from '@/lib/statusTransitions'
import { StatusTransitionButtons } from '@/components/status/StatusTransitionButtons'

// The rest of the pipeline this Production Order will eventually drive --
// shown for orientation, not implemented. See docs/production-lifecycle.md;
// none of these stages exist yet in P2, so this is deliberately just a
// static roadmap, never fake data or a fake status.
const FUTURE_STAGES = [
  'Material Requirement',
  'Material Allocation',
  'Scheduling',
  'Execution',
  'Completion',
  'Finished Goods',
]

export function ProductionOrderDetailPage() {
  const { id } = useParams()
  const productionOrderId = Number(id)
  const navigate = useNavigate()
  const { user } = useAuth()
  const allowWrite = canWriteDepartment(user, 'sales')

  const [po, setPo] = useState<ProductionOrder | null>(null)
  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    getProductionOrder(productionOrderId)
      .then((result) => {
        setPo(result)
        return getOrder(result.order_id)
      })
      .then(setOrder)
      .catch((err) => setError(getApiErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [productionOrderId])

  useEffect(load, [load])

  async function handleStatusChange(status: (typeof PRODUCTION_ORDER_TRANSITIONS)['planned'][number], reason?: string) {
    setBusy(true)
    setError(null)
    try {
      const updated = await updateProductionOrderStatus(productionOrderId, status, reason)
      setPo(updated)
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <AppLayout>
        <div className="flex justify-center py-24">
          <Spinner size={28} className="text-gold-300" />
        </div>
      </AppLayout>
    )
  }

  if (!po) {
    return (
      <AppLayout>
        <Alert variant="error">{error ?? 'Production order not found.'}</Alert>
      </AppLayout>
    )
  }

  const nextStatuses = PRODUCTION_ORDER_TRANSITIONS[po.status]

  return (
    <AppLayout>
      <PageHeader title={po.production_order_number} subtitle={po.customer_name ?? undefined} />

      <Alert variant="error">{error}</Alert>

      <GlassCard className="mb-6 p-8">
        <div className="mb-6 flex flex-wrap items-center gap-4">
          <StatusBadge status={po.status} />
          <Badge tone="neutral">{`${po.priority} priority`}</Badge>
          {allowWrite && nextStatuses.length > 0 && (
            <div className="ml-auto">
              <StatusTransitionButtons
                nextStatuses={nextStatuses}
                reasonRequiredFor={PRODUCTION_ORDER_STATUSES_REQUIRING_REASON}
                reasonLabel="Reason for cancelling"
                busy={busy}
                onChange={handleStatusChange}
              />
            </div>
          )}
        </div>

        <h2 className="mb-4 font-display text-base font-medium text-white">Order information</h2>
        <dl className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          <Field
            label="Customer order"
            value={
              <Link to={`/orders/${po.order_id}`} className="text-gold-300 hover:text-gold-200">
                {po.order_number}
              </Link>
            }
          />
          <Field label="Customer" value={po.customer_name ?? '—'} />
          <Field label="Order date" value={order ? formatDate(order.order_date) : '—'} />
          <Field label="Due date" value={formatDate(po.due_date)} />
        </dl>

        <h2 className="mt-8 mb-4 font-display text-base font-medium text-white">Production information</h2>
        <dl className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          <Field
            label="Product"
            value={po.product_code ? `${po.product_code} — ${po.product_name}` : `#${po.product_id}`}
          />
          <Field label="Ordered quantity" value={`${po.ordered_quantity ?? '—'} ${po.unit ?? ''}`} />
          <Field label="Planned production quantity" value={`${po.planned_quantity} ${po.unit ?? ''}`} />
          <Field
            label="Remaining order quantity"
            value={po.remaining_order_quantity !== null ? `${po.remaining_order_quantity} ${po.unit ?? ''}` : '—'}
          />
        </dl>

        {po.status === 'cancelled' && po.cancel_reason && (
          <div className="mt-6">
            <Field label="Cancel reason" value={po.cancel_reason} />
          </div>
        )}
        {po.notes && (
          <div className="mt-6">
            <Field label="Notes" value={po.notes} />
          </div>
        )}
      </GlassCard>

      <GlassCard className="mb-6 overflow-hidden">
        <div className="border-b border-white/10 px-6 py-4">
          <h2 className="font-display text-lg font-medium text-white">Production pipeline</h2>
        </div>
        <div className="flex flex-wrap items-center gap-3 px-6 py-5">
          <Badge tone={po.status === 'cancelled' ? 'danger' : 'gold'}>Production order</Badge>
          {FUTURE_STAGES.map((stage) => (
            <span key={stage} className="flex items-center gap-3">
              <span className="text-white/20">→</span>
              <Badge tone="neutral">{stage}</Badge>
            </span>
          ))}
        </div>
        <p className="border-t border-white/10 px-6 py-3 text-xs text-white/40">
          Later stages aren't implemented yet -- see docs/production-lifecycle.md.
        </p>
      </GlassCard>

      <div className="mb-6">
        <HistoryTimeline resourcePath="/api/production-orders" id={productionOrderId} />
      </div>

      <button type="button" onClick={() => navigate(-1)} className="text-sm text-white/50 hover:text-white">
        ← Back
      </button>
    </AppLayout>
  )
}
