import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { Alert, Badge, Field, GlassCard, PageHeader, Spinner, StatusBadge } from '@/components/ui'
import { Button, EmptyState, TextField } from '@/components/ui'
import {
  allocateMaterial,
  calculateMaterialRequirements,
  getMaterialRequirements,
  getProductionOrder,
  releaseMaterialAllocation,
  updateProductionOrderStatus,
} from '@/api/productionOrders'
import { getOrder } from '@/api/orders'
import type { ProductionOrder } from '@/types/productionOrder'
import type { Order } from '@/types/order'
import type { MaterialRequirementSummary } from '@/types/materialRequirement'
import { getApiErrorMessage } from '@/lib/apiError'
import { formatDate, formatDateTime } from '@/lib/dateFormat'
import { HistoryTimeline } from '@/components/history/HistoryTimeline'
import { useAuth } from '@/hooks/useAuth'
import { canWriteDepartment } from '@/lib/roles'
import { PRODUCTION_ORDER_STATUSES_REQUIRING_REASON, PRODUCTION_ORDER_TRANSITIONS } from '@/lib/statusTransitions'
import { StatusTransitionButtons } from '@/components/status/StatusTransitionButtons'

// The rest of the pipeline this Production Order will eventually drive --
// shown for orientation, not implemented. See docs/production-lifecycle.md;
// none of these stages exist yet, so this is deliberately just a static
// roadmap, never fake data or a fake status. "Material Requirement" and
// "Material Allocation" are no longer here -- P3/P4, implemented below.
const FUTURE_STAGES = ['Scheduling', 'Execution', 'Completion', 'Finished Goods']

const OVERALL_STATUS_LABEL: Record<MaterialRequirementSummary['overall_status'], string> = {
  not_calculated: 'Requirement not calculated',
  available: 'Materials available',
  short: 'Materials short',
}

const ALLOCATION_STATUS_LABEL: Record<MaterialRequirementSummary['allocation_status'], string> = {
  not_calculated: 'Requirement not calculated',
  not_allocated: 'Not allocated',
  partially_allocated: 'Partially allocated',
  fully_allocated: 'Fully allocated',
}

export function ProductionOrderDetailPage() {
  const { id } = useParams()
  const productionOrderId = Number(id)
  const navigate = useNavigate()
  const { user } = useAuth()
  const allowWrite = canWriteDepartment(user, 'sales')

  const [po, setPo] = useState<ProductionOrder | null>(null)
  const [order, setOrder] = useState<Order | null>(null)
  const [requirements, setRequirements] = useState<MaterialRequirementSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [calculating, setCalculating] = useState(false)
  const [allocateQty, setAllocateQty] = useState<Record<number, string>>({})
  const [releaseQty, setReleaseQty] = useState<Record<number, string>>({})
  const [actionBusyId, setActionBusyId] = useState<number | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    getProductionOrder(productionOrderId)
      .then((result) => {
        setPo(result)
        return Promise.all([getOrder(result.order_id), getMaterialRequirements(productionOrderId)])
      })
      .then(([orderResult, requirementsResult]) => {
        setOrder(orderResult)
        setRequirements(requirementsResult)
      })
      .catch((err) => setError(getApiErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [productionOrderId])

  useEffect(load, [load])

  async function handleCalculate() {
    setCalculating(true)
    setError(null)
    try {
      const result = await calculateMaterialRequirements(productionOrderId)
      setRequirements(result)
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setCalculating(false)
    }
  }

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

  async function handleAllocate(requirementId: number) {
    const raw = allocateQty[requirementId]
    const quantity = Number(raw)
    if (!raw || !Number.isFinite(quantity) || quantity <= 0) {
      setError('Enter a quantity greater than zero to allocate.')
      return
    }
    setActionBusyId(requirementId)
    setError(null)
    try {
      const result = await allocateMaterial(productionOrderId, requirementId, quantity)
      setRequirements(result)
      setAllocateQty((prev) => ({ ...prev, [requirementId]: '' }))
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setActionBusyId(null)
    }
  }

  async function handleRelease(requirementId: number) {
    const raw = releaseQty[requirementId]
    const quantity = Number(raw)
    if (!raw || !Number.isFinite(quantity) || quantity <= 0) {
      setError('Enter a quantity greater than zero to release.')
      return
    }
    setActionBusyId(requirementId)
    setError(null)
    try {
      const result = await releaseMaterialAllocation(productionOrderId, requirementId, quantity)
      setRequirements(result)
      setReleaseQty((prev) => ({ ...prev, [requirementId]: '' }))
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setActionBusyId(null)
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
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-6 py-4">
          <div className="flex items-center gap-3">
            <h2 className="font-display text-lg font-medium text-white">Material requirements</h2>
            {requirements && (
              <Badge
                tone={
                  requirements.overall_status === 'available'
                    ? 'success'
                    : requirements.overall_status === 'short'
                      ? 'danger'
                      : 'neutral'
                }
              >
                {OVERALL_STATUS_LABEL[requirements.overall_status]}
              </Badge>
            )}
            {requirements && requirements.items.length > 0 && (
              <Badge
                tone={
                  requirements.allocation_status === 'fully_allocated'
                    ? 'success'
                    : requirements.allocation_status === 'partially_allocated'
                      ? 'gold'
                      : 'neutral'
                }
              >
                {`Materials: ${ALLOCATION_STATUS_LABEL[requirements.allocation_status].toUpperCase()}${
                  requirements.allocation_status === 'partially_allocated'
                    ? ` — ${requirements.items
                        .reduce((sum, i) => sum + i.remaining_to_allocate, 0)
                        .toLocaleString()} remaining`
                    : ''
                }`}
              </Badge>
            )}
          </div>
          {allowWrite && po.status === 'planned' && (
            <Button size="sm" variant="ghost" isLoading={calculating} onClick={handleCalculate}>
              {requirements && requirements.items.length > 0 ? 'Recalculate' : 'Calculate requirements'}
            </Button>
          )}
        </div>
        {!requirements || requirements.items.length === 0 ? (
          <EmptyState
            title="Requirement not calculated"
            message={
              po.status === 'planned'
                ? "Calculate this production order's material requirement from its product's BOM and packaging."
                : 'No material requirement was calculated before this production order left planning.'
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-xs tracking-wide text-white/40 uppercase">
                  <th className="px-6 py-4 font-medium">Material</th>
                  <th className="px-6 py-4 text-right font-medium">Required</th>
                  <th className="px-6 py-4 text-right font-medium">Available</th>
                  <th className="px-6 py-4 text-right font-medium">Allocated</th>
                  <th className="px-6 py-4 text-right font-medium">Remaining</th>
                  <th className="px-6 py-4 text-right font-medium">Shortage</th>
                  <th className="px-6 py-4 font-medium">Status</th>
                  {allowWrite && <th className="px-6 py-4 font-medium">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {requirements.items.map((item) => {
                  const itemAllocationStatus: MaterialRequirementSummary['allocation_status'] =
                    item.remaining_to_allocate <= 0
                      ? 'fully_allocated'
                      : item.allocated_quantity > 0
                        ? 'partially_allocated'
                        : 'not_allocated'
                  const maxAllocatable = Math.max(
                    Math.min(item.remaining_to_allocate, item.available_quantity),
                    0,
                  )
                  return (
                    <tr key={item.id} className="border-b border-white/5 last:border-0 align-top">
                      <td className="px-6 py-4 text-white">
                        {item.code} — {item.name}
                        <div className="mt-1 text-xs text-white/40">{item.material_type_label}</div>
                      </td>
                      <td className="px-6 py-4 text-right text-white/60">{item.required_quantity}</td>
                      <td className="px-6 py-4 text-right text-white/60">{item.available_quantity}</td>
                      <td className="px-6 py-4 text-right text-white/60">{item.allocated_quantity}</td>
                      <td className="px-6 py-4 text-right text-white/60">{item.remaining_to_allocate}</td>
                      <td className="px-6 py-4 text-right">
                        {item.shortage_quantity > 0 ? (
                          <span className="text-red-300">{item.shortage_quantity}</span>
                        ) : (
                          <span className="text-white/40">0</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <Badge
                          tone={
                            itemAllocationStatus === 'fully_allocated'
                              ? 'success'
                              : itemAllocationStatus === 'partially_allocated'
                                ? 'gold'
                                : 'neutral'
                          }
                        >
                          {ALLOCATION_STATUS_LABEL[itemAllocationStatus]}
                        </Badge>
                      </td>
                      {allowWrite && (
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-2">
                            {po.status === 'planned' && maxAllocatable > 0 && (
                              <div className="flex items-end gap-2">
                                <div className="w-28">
                                  <TextField
                                    label="Allocate"
                                    type="number"
                                    min={0}
                                    max={maxAllocatable}
                                    step="any"
                                    placeholder={`${maxAllocatable}`}
                                    value={allocateQty[item.id] ?? ''}
                                    onChange={(e) =>
                                      setAllocateQty((prev) => ({ ...prev, [item.id]: e.target.value }))
                                    }
                                  />
                                </div>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  isLoading={actionBusyId === item.id}
                                  onClick={() => handleAllocate(item.id)}
                                >
                                  Allocate
                                </Button>
                              </div>
                            )}
                            {item.allocated_quantity > 0 && (
                              <div className="flex items-end gap-2">
                                <div className="w-28">
                                  <TextField
                                    label="Release"
                                    type="number"
                                    min={0}
                                    max={item.allocated_quantity}
                                    step="any"
                                    placeholder={`${item.allocated_quantity}`}
                                    value={releaseQty[item.id] ?? ''}
                                    onChange={(e) =>
                                      setReleaseQty((prev) => ({ ...prev, [item.id]: e.target.value }))
                                    }
                                  />
                                </div>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  isLoading={actionBusyId === item.id}
                                  onClick={() => handleRelease(item.id)}
                                >
                                  Release
                                </Button>
                              </div>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {requirements && requirements.calculated_at && (
          <p className="border-t border-white/10 px-6 py-3 text-xs text-white/40">
            Last calculated {formatDateTime(requirements.calculated_at)} against {requirements.items.find((i) => i.bom_number)?.bom_number ?? 'the active BOM'}.
          </p>
        )}
      </GlassCard>

      <GlassCard className="mb-6 overflow-hidden">
        <div className="border-b border-white/10 px-6 py-4">
          <h2 className="font-display text-lg font-medium text-white">Production pipeline</h2>
        </div>
        <div className="flex flex-wrap items-center gap-3 px-6 py-5">
          <Badge tone={po.status === 'cancelled' ? 'danger' : 'gold'}>Production order</Badge>
          <span className="flex items-center gap-3">
            <span className="text-white/20">→</span>
            <Badge
              tone={
                requirements?.overall_status === 'available'
                  ? 'success'
                  : requirements?.overall_status === 'short'
                    ? 'danger'
                    : 'neutral'
              }
            >
              Material requirement
            </Badge>
          </span>
          <span className="flex items-center gap-3">
            <span className="text-white/20">→</span>
            <Badge
              tone={
                requirements?.allocation_status === 'fully_allocated'
                  ? 'success'
                  : requirements?.allocation_status === 'partially_allocated'
                    ? 'gold'
                    : 'neutral'
              }
            >
              Material allocation
            </Badge>
          </span>
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
