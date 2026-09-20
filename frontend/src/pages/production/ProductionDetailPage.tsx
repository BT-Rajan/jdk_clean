import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import {
  Alert,
  Button,
  ConfirmDialog,
  DeleteIcon,
  EditIcon,
  Field,
  GlassCard,
  Modal,
  PageHeader,
  SelectField,
  Spinner,
  StatusBadge,
  TabPanel,
  Tabs,
  TextField,
  TextareaField,
} from '@/components/ui'
import {
  adminReviewProductionBatch,
  deleteProductionBatch,
  getMaterialRequirements,
  getProductionBatch,
  getProductionReadiness,
  logPartialProduction,
  restoreProductionBatch,
  updateProductionBatchStatus,
} from '@/api/production'
import type {
  ActualMaterialUsed,
  MaterialRequirement,
  ProductionBatch,
  ReadinessResult,
  SettableProductionStatus,
} from '@/types/production'
import { getApiErrorMessage } from '@/lib/apiError'
import { formatDate, formatDateTime } from '@/lib/dateFormat'
import { clampNonNegativeString } from '@/lib/number'
import { HistoryTimeline } from '@/components/history/HistoryTimeline'
import { useAuth } from '@/hooks/useAuth'
import { canWrite, isAdmin } from '@/lib/roles'
import { PRODUCTION_STATUSES_REQUIRING_REASON, PRODUCTION_TRANSITIONS } from '@/lib/statusTransitions'
import { StatusTransitionButtons } from '@/components/status/StatusTransitionButtons'
import { productionAdminReviewSchema, type ProductionAdminReviewFormValues } from '@/lib/validation'
import { ProductionReadinessPanel } from './ProductionReadinessPanel'

/** Calendar days scheduled_start through scheduled_end, inclusive -- a
 * batch scheduled start==end is a 1-day job. */
function plannedDurationDays(startISO: string, endISO: string): number {
  const start = new Date(`${startISO}T00:00:00`)
  const end = new Date(`${endISO}T00:00:00`)
  return Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
}

function actualDurationHours(startISO: string, endISO: string): number {
  return (new Date(endISO).getTime() - new Date(startISO).getTime()) / (1000 * 60 * 60)
}

function formatHoursAsDaysHours(hours: number): string {
  const days = Math.floor(hours / 24)
  const remainder = Math.round((hours - days * 24) * 10) / 10
  return days === 0 ? `${remainder}h` : `${days}d ${remainder}h`
}

/** produced_quantity - planned_quantity, signed -- "+3 over plan" /
 * "-4 under plan" / "on plan". */
function formatQuantityVariance(delta: number, unit: string | null): string {
  const rounded = Math.round(delta * 10000) / 10000
  if (Math.abs(rounded) < 0.0001) return 'On plan'
  const sign = rounded > 0 ? '+' : ''
  return `${sign}${rounded} ${unit ?? ''} ${rounded > 0 ? 'over' : 'under'} plan`
}

function AdminReviewModal({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean
  onClose: () => void
  onSubmit: (notes: string) => Promise<void>
}) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ProductionAdminReviewFormValues>({ resolver: zodResolver(productionAdminReviewSchema) })

  useEffect(() => {
    if (open) reset({ notes: '' })
  }, [open, reset])

  return (
    <Modal open={open} title="Acknowledge admin review" onClose={onClose}>
      <form onSubmit={handleSubmit((v) => onSubmit(v.notes))} noValidate className="flex flex-col gap-4">
        <TextareaField label="Notes" error={errors.notes?.message} {...register('notes')} />
        <div className="mt-2 flex justify-end gap-3">
          <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" isLoading={isSubmitting}>Acknowledge</Button>
        </div>
      </form>
    </Modal>
  )
}

const TABS = [
  { id: 'summary', label: 'Summary' },
  { id: 'materials', label: 'Materials' },
  { id: 'execution', label: 'Execution' },
  { id: 'variance', label: 'Variance' },
  { id: 'product-bom', label: 'Product & BOM' },
  { id: 'history', label: 'History' },
]

/** No-substitution sentinel for the alternative-material <select> -- ''
 * means "use the BOM's own material," any other value is a raw_material_id. */
const NO_SUBSTITUTION = ''

export function ProductionDetailPage() {
  const { id } = useParams()
  const batchId = Number(id)
  const navigate = useNavigate()
  const { user } = useAuth()
  const allowWrite = canWrite(user?.role)
  const allowAdmin = isAdmin(user?.role)

  const [batch, setBatch] = useState<ProductionBatch | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [adminReviewOpen, setAdminReviewOpen] = useState(false)
  const [justDeleted, setJustDeleted] = useState(false)
  const [producedQuantity, setProducedQuantity] = useState('')
  // Only asked for -- and only required -- when completing would leave
  // produced_quantity different from planned_quantity (see the backend's
  // own tolerance in production_service.QUANTITY_DISCREPANCY_TOLERANCE).
  const [discrepancyReason, setDiscrepancyReason] = useState('')
  const [discrepancyReasonError, setDiscrepancyReasonError] = useState<string | null>(null)
  const [materialRequirements, setMaterialRequirements] = useState<MaterialRequirement[]>([])
  // User-entered overrides only -- a material with no entry here shows
  // (and, on submit, uses) the BOM's planned figure scaled to whatever
  // quantity is currently entered above, not a value frozen at whatever
  // the full remaining quantity happened to be when this was fetched.
  // Without that scaling, typing a smaller "this round" quantity (the
  // whole point of partial logging) would silently submit a wildly
  // inflated actual-used figure and flag a false discrepancy on every
  // partial log unless someone remembered to hand-recalculate every
  // material first.
  const [actualUsage, setActualUsage] = useState<Record<number, string>>({})
  const [requirementsBasisQuantity, setRequirementsBasisQuantity] = useState(0)
  const [substitutions, setSubstitutions] = useState<Record<number, string>>({})
  const [activeTab, setActiveTab] = useState('summary')

  const [readiness, setReadiness] = useState<ReadinessResult | null>(null)
  const [readinessLoading, setReadinessLoading] = useState(false)
  const [readinessError, setReadinessError] = useState<string | null>(null)

  function load() {
    setLoading(true)
    getProductionBatch(batchId)
      .then((b) => {
        setBatch(b)
        // What's actually still left to run -- not the original full
        // plan -- now that a batch can already carry partial output from
        // one or more "Log production" calls (e.g. paused partway
        // through). Falls back to the full plan once nothing remains.
        const remaining = b.planned_quantity - b.produced_quantity
        setProducedQuantity(String(remaining > 0 ? remaining : b.planned_quantity))
      })
      .catch((err) => setError(getApiErrorMessage(err)))
      .finally(() => setLoading(false))
  }

  useEffect(load, [batchId])

  const isActive = batch?.status === 'planned' || batch?.status === 'in_progress' || batch?.status === 'paused'

  // Readiness only means something before/while a batch is running -- once
  // it's completed or cancelled, "can we start" is moot (see backend's
  // quick_status, which stops at 'planned' the same way). A paused batch
  // still counts -- it's stalled, not finished, and the Materials tab
  // below still needs its current requirement/stock figures.
  useEffect(() => {
    if (!isActive) {
      setReadiness(null)
      return
    }
    setReadinessLoading(true)
    setReadinessError(null)
    getProductionReadiness(batchId)
      .then(setReadiness)
      .catch((err) => setReadinessError(getApiErrorMessage(err)))
      .finally(() => setReadinessLoading(false))
  }, [batchId, isActive])

  useEffect(() => {
    if (!batch || (batch.status !== 'in_progress' && batch.status !== 'paused')) return
    getMaterialRequirements(batchId)
      .then((reqs) => {
        setMaterialRequirements(reqs)
        setRequirementsBasisQuantity(batch.planned_quantity - batch.produced_quantity)
        // No overrides yet -- defaultActualUsed derives each field's
        // shown value from this basis, rescaled live as the quantity
        // field changes, until someone actually types into it.
        setActualUsage({})
      })
      .catch(() => {
        // Best-effort: a product with no BOM has nothing to show here,
        // and "Complete batch" still works fine with no actual-quantity
        // inputs at all -- same as before this existed.
      })
  }, [batchId, batch?.status])

  /** The BOM's planned (scrap-inflated) figure for material `r`, scaled
   * from whatever quantity materialRequirements was actually fetched for
   * (requirementsBasisQuantity) down to whatever's currently entered in
   * the quantity field -- so it always matches *this round*, not
   * whatever the full remaining amount was at the last fetch. */
  function defaultActualUsed(r: MaterialRequirement): number {
    const quantity = Number(producedQuantity)
    if (!requirementsBasisQuantity || !Number.isFinite(quantity)) return r.planned_required
    return (r.planned_required / requirementsBasisQuantity) * quantity
  }

  function actualUsedValue(r: MaterialRequirement): string {
    return actualUsage[r.raw_material_id] ?? String(Math.round(defaultActualUsed(r) * 10000) / 10000)
  }

  /** Same scaling as defaultActualUsed, for the net (zero-scrap) figure
   * shown alongside it -- both come from the same BOM line and scale
   * identically with quantity. */
  function scaledNetRequired(r: MaterialRequirement): number {
    const quantity = Number(producedQuantity)
    if (!requirementsBasisQuantity || !Number.isFinite(quantity)) return r.net_required
    return (r.net_required / requirementsBasisQuantity) * quantity
  }

  async function handleStatusChange(status: SettableProductionStatus, reason?: string) {
    setBusy(true)
    setError(null)
    try {
      const updated = await updateProductionBatchStatus(batchId, status, undefined, reason)
      setBatch(updated)
      const unscheduled = updated.resulting_unscheduled_quantity
      setNotice(
        `Status changed to ${status.replace(/_/g, ' ')}.` +
          (unscheduled != null
            ? ` This order now has ${unscheduled} ${updated.unit ?? ''} of ${updated.product_name ?? 'this product'} unscheduled.`
            : ''),
      )
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  /** Pre-fills the "New batch" form with this batch's product/order/
   * machine and however much of the order line is still unsatisfied
   * (order_quantity_summary.remaining -- accounts for every other batch
   * on the same order+product, not just this one's own shortfall), so
   * rescheduling cancelled or under-completed production is a couple of
   * clicks instead of re-entering everything from scratch. Dates aren't
   * pre-filled: whatever this batch was scheduled for is in the past by
   * now, so a fresh pair is always needed. */
  function handleReschedule() {
    if (!batch) return
    const remaining = batch.order_quantity_summary
      ? batch.order_quantity_summary.remaining
      : Math.max(batch.planned_quantity - batch.produced_quantity, 0)
    const params = new URLSearchParams({
      product_id: String(batch.product_id),
      planned_quantity: String(remaining || batch.planned_quantity),
    })
    if (batch.order_id) params.set('order_id', String(batch.order_id))
    navigate(`/production/new?${params.toString()}`)
  }

  function buildActualMaterials(): ActualMaterialUsed[] | undefined {
    const actualMaterials: ActualMaterialUsed[] = materialRequirements
      .map((r): ActualMaterialUsed | null => {
        const quantityUsed = Number(actualUsedValue(r))
        if (!Number.isFinite(quantityUsed) || quantityUsed < 0) return null
        const substitutedId = substitutions[r.raw_material_id]
        return substitutedId
          ? {
              raw_material_id: Number(substitutedId),
              quantity_used: quantityUsed,
              substituted_for_raw_material_id: r.raw_material_id,
            }
          : { raw_material_id: r.raw_material_id, quantity_used: quantityUsed }
      })
      .filter((m): m is ActualMaterialUsed => m !== null)
    return actualMaterials.length > 0 ? actualMaterials : undefined
  }

  async function handleComplete() {
    if (!batch) return
    const quantity = Number(producedQuantity)
    const thisRound = Number.isFinite(quantity) && quantity > 0 ? quantity : 0
    const finalQuantity = batch.produced_quantity + thisRound
    const hasDiscrepancy = Math.abs(finalQuantity - batch.planned_quantity) > 0.0001
    if (hasDiscrepancy && !discrepancyReason.trim()) {
      setDiscrepancyReasonError('A reason is required: this would complete at a different quantity than planned.')
      return
    }
    setDiscrepancyReasonError(null)
    setBusy(true)
    setError(null)
    try {
      const updated = await updateProductionBatchStatus(
        batchId,
        'completed',
        thisRound > 0 ? thisRound : undefined,
        hasDiscrepancy ? discrepancyReason.trim() : undefined,
        buildActualMaterials(),
      )
      setBatch(updated)
      setDiscrepancyReason('')
      setNotice(
        updated.material_discrepancy_flag
          ? 'Batch completed, but actual material usage needs a look -- see below.'
          : 'Batch completed. Raw materials consumed and finished goods received into inventory.',
      )
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleLogPartial() {
    const quantity = Number(producedQuantity)
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setError('Enter a quantity greater than zero to log.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const updated = await logPartialProduction(batchId, {
        quantity,
        actual_materials: buildActualMaterials(),
      })
      setBatch(updated)
      setNotice(
        `Logged ${quantity} ${updated.unit ?? ''} produced so far. ${updated.batch_number} is still ${updated.status.replace(/_/g, ' ')} -- ` +
          'pause it, or keep going and complete it once the rest is done.',
      )
      // Refresh the requirements/defaults against the new remaining amount.
      const reqs = await getMaterialRequirements(batchId)
      setMaterialRequirements(reqs)
      setRequirementsBasisQuantity(updated.planned_quantity - updated.produced_quantity)
      setActualUsage({})
      setSubstitutions({})
      const remaining = updated.planned_quantity - updated.produced_quantity
      setProducedQuantity(String(remaining > 0 ? remaining : ''))
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    setBusy(true)
    try {
      await deleteProductionBatch(batchId)
      setConfirmOpen(false)
      setJustDeleted(true)
      setNotice('Batch deleted.')
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleRestore() {
    setBusy(true)
    try {
      const restored = await restoreProductionBatch(batchId)
      setBatch(restored)
      setJustDeleted(false)
      setNotice('Batch restored.')
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

  if (!batch) {
    return (
      <AppLayout>
        <Alert variant="error">{error ?? 'Production batch not found.'}</Alert>
      </AppLayout>
    )
  }

  const nextStatuses = PRODUCTION_TRANSITIONS[batch.status]
  const canComplete = allowWrite && !justDeleted && nextStatuses.includes('completed')
  const otherTransitions = nextStatuses.filter((s) => s !== 'completed')
  // Readiness only gates the 'planned' -> 'in_progress' transition --
  // shown right beside the Start button instead of only discoverable by
  // scrolling down to the readiness panel.
  const startBlockedReason =
    batch.status === 'planned' && readiness && readiness.status !== 'READY' ? readiness.summary : undefined
  const canReschedule =
    allowWrite &&
    !justDeleted &&
    (batch.status === 'cancelled' || (batch.status === 'completed' && batch.produced_quantity < batch.planned_quantity))
  // Live projection of whether completing right now, with whatever's
  // currently typed into the quantity box, would leave produced_quantity
  // different from planned_quantity -- same tolerance the backend itself
  // enforces (production_service.QUANTITY_DISCREPANCY_TOLERANCE).
  const projectedProducedQuantity =
    batch.produced_quantity + (Number.isFinite(Number(producedQuantity)) ? Number(producedQuantity) || 0 : 0)
  const hasProjectedDiscrepancy = Math.abs(projectedProducedQuantity - batch.planned_quantity) > 0.0001

  // A material's approved alternatives, keyed by the BOM material's own id
  // -- read straight from the one readiness computation, never re-derived.
  const alternativesByMaterial = new Map(readiness?.materials.map((m) => [m.raw_material_id, m.alternatives]) ?? [])

  return (
    <AppLayout>
      <PageHeader
        title={batch.batch_number}
        subtitle={batch.product_code ? `${batch.product_code} — ${batch.product_name}` : undefined}
        actions={
          !justDeleted ? (
            <>
              {canReschedule && (
                <Button size="sm" onClick={handleReschedule}>Reschedule</Button>
              )}
              {allowWrite && batch.status === 'planned' && (
                <Button
                  variant="primary"
                  size="sm"
                  className="!w-9 !px-0"
                  onClick={() => navigate(`/production/${batchId}/edit`)}
                  aria-label="Edit"
                >
                  <EditIcon />
                </Button>
              )}
              {allowWrite && batch.status === 'planned' && (
                <Button
                  variant="danger"
                  size="sm"
                  className="!w-9 !px-0"
                  onClick={() => setConfirmOpen(true)}
                  aria-label="Delete"
                >
                  <DeleteIcon />
                </Button>
              )}
            </>
          ) : undefined
        }
      />

      <Alert variant="error">{error}</Alert>
      {notice && (
        <div className="mb-4 flex items-center justify-between rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          <span>{notice}</span>
          {justDeleted && allowWrite && (
            <button type="button" onClick={handleRestore} className="font-medium text-gold-300 underline">Undo</button>
          )}
        </div>
      )}

      {batch.days_overdue != null && (
        <div className="mb-6 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {batch.days_overdue} day{batch.days_overdue === 1 ? '' : 's'} overdue -- past its scheduled end of{' '}
          {formatDate(batch.scheduled_end)}.
        </div>
      )}

      {batch.machine_conflicts.length > 0 && (
        <div className="mb-6 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          <p className="font-medium">Machine conflict -- {batch.machine_name} is also booked for:</p>
          <ul className="mt-1 list-inside list-disc">
            {batch.machine_conflicts.map((c) => (
              <li key={c.id}>
                <Link to={`/production/${c.id}`} className="underline hover:text-amber-100">
                  {c.batch_number}
                </Link>{' '}
                ({formatDate(c.scheduled_start)} – {formatDate(c.scheduled_end)})
              </li>
            ))}
          </ul>
        </div>
      )}

      {batch.admin_review_required && allowAdmin && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          <span>This batch is behind schedule and flagged for admin review.</span>
          <Button variant="ghost" size="sm" onClick={() => setAdminReviewOpen(true)}>Acknowledge</Button>
        </div>
      )}

      <GlassCard className="mb-6 p-8">
        <div className="flex flex-wrap items-center gap-4">
          <StatusBadge status={batch.status} />
          {batch.auto_scheduled && (
            <span className="rounded-full border border-gold-400/30 bg-gold-500/10 px-2.5 py-1 text-xs font-medium text-gold-200">
              Auto-scheduled on order confirmation
            </span>
          )}
          {!justDeleted && otherTransitions.length > 0 && (
            <div className="ml-auto">
              <StatusTransitionButtons
                nextStatuses={otherTransitions}
                reasonRequiredFor={PRODUCTION_STATUSES_REQUIRING_REASON}
                reasonLabel="Reason"
                busy={busy}
                onChange={handleStatusChange}
                disabledStatuses={startBlockedReason ? { in_progress: startBlockedReason } : undefined}
              />
            </div>
          )}
        </div>
      </GlassCard>

      {batch.order_quantity_summary && (
        <GlassCard className="mb-6 p-6">
          <p className="mb-3 text-xs font-medium tracking-wide text-white/50 uppercase">
            This order's {batch.product_code ?? 'product'} line
          </p>
          <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
            <span className="text-white/60">
              Ordered <span className="font-medium text-white">{batch.order_quantity_summary.ordered}</span>{' '}
              {batch.unit}
            </span>
            <span className="text-white/60">
              Scheduled <span className="font-medium text-white">{batch.order_quantity_summary.scheduled}</span>{' '}
              {batch.unit}
            </span>
            <span className="text-white/60">
              Produced <span className="font-medium text-white">{batch.order_quantity_summary.produced}</span>{' '}
              {batch.unit}
            </span>
            <span className={batch.order_quantity_summary.remaining > 0 ? 'text-amber-300' : 'text-white/60'}>
              Remaining{' '}
              <span className="font-medium">{batch.order_quantity_summary.remaining}</span> {batch.unit}
            </span>
          </div>
        </GlassCard>
      )}

      {isActive && (
        <ProductionReadinessPanel readiness={readiness} loading={readinessLoading} error={readinessError} />
      )}

      <GlassCard className="mb-6 p-8">
        <Tabs items={TABS} activeId={activeTab} onChange={setActiveTab} className="mb-6" />

        <TabPanel id="summary" activeId={activeTab}>
          <dl className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            <Field
              label="Order"
              value={
                batch.order_id ? (
                  <Link to={`/orders/${batch.order_id}`} className="text-gold-300 hover:text-gold-200">
                    {batch.order_number}
                  </Link>
                ) : (
                  batch.order_number
                )
              }
            />
            <Field label="Machine" value={batch.machine_name} />
            <Field label="Planned quantity" value={`${batch.planned_quantity} ${batch.unit ?? ''}`} />
            <Field
              label="Produced quantity"
              value={batch.produced_quantity ? `${batch.produced_quantity} ${batch.unit ?? ''}` : null}
            />
            {batch.produced_quantity > 0 && (
              <Field
                label="Planned vs actual quantity"
                value={formatQuantityVariance(batch.produced_quantity - batch.planned_quantity, batch.unit)}
              />
            )}
            <Field label="Scheduled start" value={formatDate(batch.scheduled_start)} />
            <Field label="Scheduled end" value={formatDate(batch.scheduled_end)} />
            <Field
              label="Planned duration"
              value={`${plannedDurationDays(batch.scheduled_start, batch.scheduled_end)} day(s)`}
            />
            <Field label="Actual start" value={batch.actual_start ? formatDateTime(batch.actual_start) : null} />
            <Field label="Actual end" value={batch.actual_end ? formatDateTime(batch.actual_end) : null} />
            {batch.actual_start && batch.actual_end && (
              <Field
                label="Actual duration"
                value={formatHoursAsDaysHours(actualDurationHours(batch.actual_start, batch.actual_end))}
              />
            )}
            {batch.status === 'paused' && <Field label="Paused because" value={batch.pause_reason} />}
            {batch.status === 'cancelled' && <Field label="Cancelled because" value={batch.cancel_reason} />}
            {batch.quantity_discrepancy_reason && (
              <Field label="Quantity discrepancy reason" value={batch.quantity_discrepancy_reason} />
            )}
          </dl>
          {batch.notes && (
            <div className="mt-6">
              <dt className="text-xs font-medium tracking-wide text-white/40 uppercase">Notes</dt>
              <dd className="mt-1 text-[15px] text-white/80">{batch.notes}</dd>
            </div>
          )}
        </TabPanel>

        <TabPanel id="materials" activeId={activeTab}>
          {readiness && readiness.materials.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-xs tracking-wide text-white/40 uppercase">
                    <th className="px-3 py-3 font-medium">Material</th>
                    <th className="px-3 py-3 font-medium">Required</th>
                    <th className="px-3 py-3 font-medium">On hand</th>
                    <th className="px-3 py-3 font-medium">Reserved</th>
                    <th className="px-3 py-3 font-medium">Available</th>
                    <th className="px-3 py-3 font-medium">Shortage</th>
                  </tr>
                </thead>
                <tbody>
                  {readiness.materials.map((m) => (
                    <tr key={m.raw_material_id} className="border-b border-white/5 last:border-0">
                      <td className="px-3 py-3 text-white">
                        <Link to={`/raw-materials/${m.raw_material_id}`} className="text-gold-300 hover:text-gold-200">
                          {m.code} — {m.name}
                        </Link>
                        {m.safety_stock_warning && (
                          <span className="ml-2 text-xs text-amber-300">below safety stock</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-white/60">{m.required} {m.unit}</td>
                      <td className="px-3 py-3 text-white/60">{m.on_hand} {m.unit}</td>
                      <td className="px-3 py-3 text-white/60">{m.reserved} {m.unit}</td>
                      <td className="px-3 py-3 text-white/60">{m.available} {m.unit}</td>
                      <td className={m.shortage > 0 ? 'px-3 py-3 text-red-300' : 'px-3 py-3 text-white/60'}>
                        {m.shortage} {m.unit}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-white/50">
              {batch.status === 'completed' || batch.status === 'cancelled'
                ? 'Material requirements are only checked while a batch is planned or in progress.'
                : 'No BOM components for this product.'}
            </p>
          )}
        </TabPanel>

        <TabPanel id="execution" activeId={activeTab}>
          {canComplete ? (
            <div className="flex flex-col gap-4">
              {batch.produced_quantity > 0 && (
                <p className="text-xs text-white/50">
                  {batch.produced_quantity} {batch.unit ?? ''} already recorded against this batch
                  {batch.planned_quantity - batch.produced_quantity > 0
                    ? ` -- ${batch.planned_quantity - batch.produced_quantity} ${batch.unit ?? ''} left of the original plan.`
                    : '.'}
                </p>
              )}
              <div className="flex flex-wrap items-end gap-3">
                <div className="w-40">
                  <TextField
                    label="Quantity"
                    hint="This round's output"
                    type="number"
                    step="0.0001"
                    min="0"
                    value={producedQuantity}
                    onChange={(e) => setProducedQuantity(clampNonNegativeString(e.target.value))}
                  />
                </div>
                <Button variant="ghost" isLoading={busy} onClick={handleLogPartial}>
                  Log production
                </Button>
                <Button isLoading={busy} onClick={handleComplete}>Complete batch</Button>
              </div>
              {hasProjectedDiscrepancy && (
                <TextareaField
                  label="Discrepancy reason"
                  hint={`Completing at ${projectedProducedQuantity} ${batch.unit ?? ''} against a plan of ${batch.planned_quantity} ${batch.unit ?? ''} -- why?`}
                  value={discrepancyReason}
                  onChange={(e) => {
                    setDiscrepancyReason(e.target.value)
                    if (discrepancyReasonError) setDiscrepancyReasonError(null)
                  }}
                  error={discrepancyReasonError ?? undefined}
                />
              )}
              <p className="text-xs text-white/40">
                <strong className="text-white/60">Log production</strong> records this round's output and keeps the
                batch running -- pause it, or come back and log more later. <strong className="text-white/60">
                Complete batch</strong> records this round's output (if any) and closes it out for good; anything
                still unaccounted for in the original plan is released, not carried forward.
              </p>

              {materialRequirements.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-medium tracking-wide text-white/50 uppercase">Actual material used</p>
                  <div className="flex flex-col gap-3">
                    {materialRequirements.map((r) => {
                      const alternatives = alternativesByMaterial.get(r.raw_material_id) ?? []
                      return (
                        <div key={r.raw_material_id} className="flex flex-wrap items-end gap-3 text-sm">
                          <span className="w-40 shrink-0 text-white/70">{r.code} — {r.name}</span>
                          <div className="w-36">
                            <TextField
                              label="Actual used"
                              type="number"
                              step="0.0001"
                              min="0"
                              value={actualUsedValue(r)}
                              onChange={(e) =>
                                setActualUsage((prev) => ({
                                  ...prev,
                                  [r.raw_material_id]: clampNonNegativeString(e.target.value),
                                }))
                              }
                            />
                          </div>
                          <span className="text-xs text-white/40">
                            {r.unit} · planned {Math.round(defaultActualUsed(r) * 10000) / 10000} (net{' '}
                            {Math.round(scaledNetRequired(r) * 10000) / 10000}) for this quantity ·{' '}
                            {r.current_on_hand} on hand
                          </span>
                          {alternatives.length > 0 && (
                            <div className="w-56">
                              <SelectField
                                label="Use approved alternative"
                                value={substitutions[r.raw_material_id] ?? NO_SUBSTITUTION}
                                onChange={(e) =>
                                  setSubstitutions((prev) => ({ ...prev, [r.raw_material_id]: e.target.value }))
                                }
                              >
                                <option value={NO_SUBSTITUTION}>(use {r.code} as planned)</option>
                                {alternatives.map((alt) => (
                                  <option key={alt.raw_material_id} value={alt.raw_material_id}>
                                    {alt.code} — {alt.name} (avail {alt.available})
                                  </option>
                                ))}
                              </SelectField>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
              <p className="text-xs text-white/40">
                Consumes raw materials per the product's bill of materials (or the actual quantities entered above,
                including any explicitly chosen approved alternative) and receives the finished goods into
                inventory. The BOM itself is never changed by a substitution. Leaving a material's actual quantity
                at its planned figure deducts that; entering a different number is what's actually checked against
                this product's scrap allowance.
              </p>
            </div>
          ) : (
            <p className="text-sm text-white/50">
              {batch.status === 'planned'
                ? 'Start this batch to record actual material consumption and complete it.'
                : `This batch is ${batch.status.replace(/_/g, ' ')}; no further execution actions apply.`}
            </p>
          )}
        </TabPanel>

        <TabPanel id="variance" activeId={activeTab}>
          {batch.material_discrepancy_flag && batch.material_discrepancy_findings ? (
            <ul className="flex flex-col gap-2 text-sm text-amber-100/90">
              {batch.material_discrepancy_findings.map((f) => (
                <li key={f.raw_material_id} className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-3">
                  {f.message}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-white/50">
              {batch.status === 'completed'
                ? 'Actual material usage matched expectations -- no variance found.'
                : 'Variance is checked when this batch is completed.'}
            </p>
          )}
        </TabPanel>

        <TabPanel id="product-bom" activeId={activeTab}>
          <dl className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            <Field
              label="Product"
              value={
                batch.product_code ? (
                  <Link to={`/products/${batch.product_id}`} className="text-gold-300 hover:text-gold-200">
                    {batch.product_code} — {batch.product_name}
                  </Link>
                ) : null
              }
            />
            <Field label="Bill of materials" value={readiness?.bom_number ?? null} />
            <Field
              label="Batch size (BOM output qty)"
              value={readiness?.output_quantity != null ? `${readiness.output_quantity} ${batch.unit ?? ''}` : null}
            />
          </dl>
          <p className="mt-4 text-xs text-white/40">
            The BOM is this product's own formula, managed from the product's detail page -- production never
            copies or edits it.
          </p>
        </TabPanel>

        <TabPanel id="history" activeId={activeTab}>
          <HistoryTimeline resourcePath="/api/production-schedules" id={batchId} />
        </TabPanel>
      </GlassCard>

      <div className="mt-6">
        <Link to="/production" className="text-sm text-white/50 hover:text-white">← Back to production</Link>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Delete production batch"
        message={`Delete ${batch.batch_number}? This can be undone immediately after, but not once you leave this page.`}
        confirmLabel="Delete"
        danger
        busy={busy}
        onConfirm={handleDelete}
        onCancel={() => setConfirmOpen(false)}
      />

      <AdminReviewModal
        open={adminReviewOpen}
        onClose={() => setAdminReviewOpen(false)}
        onSubmit={async (notes) => {
          setBusy(true)
          try {
            const updated = await adminReviewProductionBatch(batchId, notes)
            setBatch(updated)
            setAdminReviewOpen(false)
            setNotice('Admin review acknowledged.')
          } catch (err) {
            setError(getApiErrorMessage(err))
          } finally {
            setBusy(false)
          }
        }}
      />
    </AppLayout>
  )
}
