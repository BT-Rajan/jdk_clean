import { useEffect, useState } from 'react'
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
  PageHeader,
  SelectField,
  Spinner,
  StatusBadge,
  TabPanel,
  Tabs,
  TextField,
} from '@/components/ui'
import {
  deleteProductionBatch,
  getMaterialRequirements,
  getProductionBatch,
  getProductionReadiness,
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
import { canWrite } from '@/lib/roles'
import { PRODUCTION_STATUSES_REQUIRING_REASON, PRODUCTION_TRANSITIONS } from '@/lib/statusTransitions'
import { StatusTransitionButtons } from '@/components/status/StatusTransitionButtons'
import { ProductionReadinessPanel } from './ProductionReadinessPanel'

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

  const [batch, setBatch] = useState<ProductionBatch | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [justDeleted, setJustDeleted] = useState(false)
  const [producedQuantity, setProducedQuantity] = useState('')
  const [materialRequirements, setMaterialRequirements] = useState<MaterialRequirement[]>([])
  const [actualUsage, setActualUsage] = useState<Record<number, string>>({})
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
        setProducedQuantity(String(b.planned_quantity))
      })
      .catch((err) => setError(getApiErrorMessage(err)))
      .finally(() => setLoading(false))
  }

  useEffect(load, [batchId])

  // Readiness only means something before/while a batch is running -- once
  // it's completed or cancelled, "can we start" is moot (see backend's
  // quick_status, which stops at 'planned' the same way).
  useEffect(() => {
    if (!batch || (batch.status !== 'planned' && batch.status !== 'in_progress')) {
      setReadiness(null)
      return
    }
    setReadinessLoading(true)
    setReadinessError(null)
    getProductionReadiness(batchId)
      .then(setReadiness)
      .catch((err) => setReadinessError(getApiErrorMessage(err)))
      .finally(() => setReadinessLoading(false))
  }, [batchId, batch?.status])

  useEffect(() => {
    if (batch?.status !== 'in_progress') return
    getMaterialRequirements(batchId)
      .then((reqs) => {
        setMaterialRequirements(reqs)
        // Pre-fill with the BOM's own planned (scrap-inflated) figure --
        // production staff adjusts from there to what was actually used;
        // leaving a field untouched deducts this same default.
        setActualUsage(Object.fromEntries(reqs.map((r) => [r.raw_material_id, String(r.planned_required)])))
      })
      .catch(() => {
        // Best-effort: a product with no BOM has nothing to show here,
        // and "Complete batch" still works fine with no actual-quantity
        // inputs at all -- same as before this existed.
      })
  }, [batchId, batch?.status])

  async function handleStatusChange(status: SettableProductionStatus, reason?: string) {
    setBusy(true)
    setError(null)
    try {
      const updated = await updateProductionBatchStatus(batchId, status, undefined, reason)
      setBatch(updated)
      setNotice(`Status changed to ${status.replace(/_/g, ' ')}.`)
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleComplete() {
    setBusy(true)
    setError(null)
    try {
      const actualMaterials: ActualMaterialUsed[] = materialRequirements
        .map((r): ActualMaterialUsed | null => {
          const quantityUsed = Number(actualUsage[r.raw_material_id])
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
      const updated = await updateProductionBatchStatus(
        batchId,
        'completed',
        Number(producedQuantity),
        undefined,
        actualMaterials.length > 0 ? actualMaterials : undefined,
      )
      setBatch(updated)
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
                reasonLabel="Reason for cancelling"
                busy={busy}
                onChange={handleStatusChange}
              />
            </div>
          )}
        </div>
      </GlassCard>

      {(batch.status === 'planned' || batch.status === 'in_progress') && (
        <ProductionReadinessPanel readiness={readiness} loading={readinessLoading} error={readinessError} />
      )}

      <GlassCard className="mb-6 p-8">
        <Tabs items={TABS} activeId={activeTab} onChange={setActiveTab} className="mb-6" />

        <TabPanel id="summary" activeId={activeTab}>
          <dl className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            <Field label="Order" value={batch.order_number} />
            <Field label="Planned quantity" value={`${batch.planned_quantity} ${batch.unit ?? ''}`} />
            <Field
              label="Produced quantity"
              value={batch.produced_quantity ? `${batch.produced_quantity} ${batch.unit ?? ''}` : null}
            />
            <Field label="Scheduled start" value={formatDate(batch.scheduled_start)} />
            <Field label="Scheduled end" value={formatDate(batch.scheduled_end)} />
            <Field label="Actual start" value={batch.actual_start ? formatDateTime(batch.actual_start) : null} />
            <Field label="Actual end" value={batch.actual_end ? formatDateTime(batch.actual_end) : null} />
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
                        {m.code} — {m.name}
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
              <div className="flex flex-wrap items-end gap-3">
                <div className="w-40">
                  <TextField
                    label="Produced quantity"
                    type="number"
                    step="0.0001"
                    min="0"
                    value={producedQuantity}
                    onChange={(e) => setProducedQuantity(clampNonNegativeString(e.target.value))}
                  />
                </div>
                <Button isLoading={busy} onClick={handleComplete}>Complete batch</Button>
              </div>

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
                              value={actualUsage[r.raw_material_id] ?? ''}
                              onChange={(e) =>
                                setActualUsage((prev) => ({
                                  ...prev,
                                  [r.raw_material_id]: clampNonNegativeString(e.target.value),
                                }))
                              }
                            />
                          </div>
                          <span className="text-xs text-white/40">
                            {r.unit} · planned {r.planned_required} (net {r.net_required}) · {r.current_on_hand} on hand
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
                : batch.status === 'in_progress'
                ? 'Complete this batch from here once production has finished.'
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
    </AppLayout>
  )
}
