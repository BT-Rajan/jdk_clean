import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { Alert, Button, ConfirmDialog, Field, GlassCard, PageHeader, Spinner, StatusBadge, TextField } from '@/components/ui'
import {
  deleteProductionBatch,
  getMaterialRequirements,
  getProductionBatch,
  restoreProductionBatch,
  updateProductionBatchStatus,
} from '@/api/production'
import type { MaterialRequirement, ProductionBatch, SettableProductionStatus } from '@/types/production'
import { getApiErrorMessage } from '@/lib/apiError'
import { formatDate, formatDateTime } from '@/lib/dateFormat'
import { clampNonNegativeString } from '@/lib/number'
import { HistoryTimeline } from '@/components/history/HistoryTimeline'
import { useAuth } from '@/hooks/useAuth'
import { canWrite } from '@/lib/roles'
import { PRODUCTION_STATUSES_REQUIRING_REASON, PRODUCTION_TRANSITIONS } from '@/lib/statusTransitions'
import { StatusTransitionButtons } from '@/components/status/StatusTransitionButtons'

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
      const actualMaterials = materialRequirements
        .map((r) => ({ raw_material_id: r.raw_material_id, quantity_used: Number(actualUsage[r.raw_material_id]) }))
        .filter((m) => Number.isFinite(m.quantity_used) && m.quantity_used >= 0)
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

  return (
    <AppLayout>
      <PageHeader
        title={batch.batch_number}
        subtitle={batch.product_code ? `${batch.product_code} — ${batch.product_name}` : undefined}
        actions={
          !justDeleted ? (
            <>
              {allowWrite && batch.status === 'planned' && (
                <Button variant="ghost" onClick={() => navigate(`/production/${batchId}/edit`)}>Edit</Button>
              )}
              {allowWrite && batch.status === 'planned' && (
                <Button variant="danger" onClick={() => setConfirmOpen(true)}>Delete</Button>
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
        <div className="mb-6 flex flex-wrap items-center gap-4">
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

        {canComplete && (
          <div className="mb-6 flex flex-col gap-4 rounded-xl border border-white/10 p-4">
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
                <div className="flex flex-col gap-2">
                  {materialRequirements.map((r) => (
                    <div key={r.raw_material_id} className="flex flex-wrap items-center gap-3 text-sm">
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
                    </div>
                  ))}
                </div>
              </div>
            )}
            <p className="text-xs text-white/40">
              Consumes raw materials per the product's bill of materials (or the actual quantities entered above)
              and receives the finished goods into inventory. Leaving a material's actual quantity at its planned
              figure deducts that; entering a different number is what's actually checked against this product's
              scrap allowance.
            </p>
          </div>
        )}

        {batch.material_discrepancy_flag && batch.material_discrepancy_findings && (
          <div className="mb-6 rounded-xl border border-amber-400/30 bg-amber-500/10 p-4">
            <p className="mb-2 text-sm font-medium text-amber-200">Material usage needs review</p>
            <ul className="flex flex-col gap-1 text-xs text-amber-100/90">
              {batch.material_discrepancy_findings.map((f) => (
                <li key={f.raw_material_id}>{f.message}</li>
              ))}
            </ul>
          </div>
        )}

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
      </GlassCard>

      <div className="mt-6">
        <HistoryTimeline resourcePath="/api/production-schedules" id={batchId} />
      </div>

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
