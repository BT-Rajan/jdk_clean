import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useParams } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import {
  Alert,
  Button,
  ConfirmDialog,
  Field,
  GlassCard,
  Modal,
  PageHeader,
  Spinner,
  StatusBadge,
  TextareaField,
} from '@/components/ui'
import {
  adminReviewFeasibility,
  closeFeasibility,
  decideFeasibilityException,
  deleteFeasibility,
  getFeasibility,
  reviveFeasibility,
  runFeasibilityCheck,
} from '@/api/feasibilities'
import type { Feasibility } from '@/types/feasibility'
import { getApiErrorMessage } from '@/lib/apiError'
import { formatDate, formatDateTime } from '@/lib/dateFormat'
import { HistoryTimeline } from '@/components/history/HistoryTimeline'
import { FeasibilityStageResultsModal } from './FeasibilityStageResultsModal'
import { useAuth } from '@/hooks/useAuth'
import { canWriteDepartment, isAdmin } from '@/lib/roles'
import {
  feasibilityAdminReviewSchema,
  feasibilityExceptionSchema,
  type FeasibilityAdminReviewFormValues,
  type FeasibilityCloseFormValues,
  type FeasibilityExceptionFormValues,
} from '@/lib/validation'

function ReasonModal({
  open,
  title,
  label,
  confirmLabel,
  onClose,
  onSubmit,
}: {
  open: boolean
  title: string
  label: string
  confirmLabel: string
  onClose: () => void
  onSubmit: (reason: string) => Promise<void>
}) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FeasibilityExceptionFormValues | FeasibilityCloseFormValues>({
    resolver: zodResolver(feasibilityExceptionSchema),
  })

  useEffect(() => {
    if (open) reset({ reason: '' })
  }, [open, reset])

  return (
    <Modal open={open} title={title} onClose={onClose}>
      <form onSubmit={handleSubmit((v) => onSubmit(v.reason))} noValidate className="flex flex-col gap-4">
        <TextareaField label={label} error={errors.reason?.message} {...register('reason')} />
        <div className="mt-2 flex justify-end gap-3">
          <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" isLoading={isSubmitting}>{confirmLabel}</Button>
        </div>
      </form>
    </Modal>
  )
}

function NotesModal({
  open,
  title,
  onClose,
  onSubmit,
}: {
  open: boolean
  title: string
  onClose: () => void
  onSubmit: (notes: string) => Promise<void>
}) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FeasibilityAdminReviewFormValues>({ resolver: zodResolver(feasibilityAdminReviewSchema) })

  useEffect(() => {
    if (open) reset({ notes: '' })
  }, [open, reset])

  return (
    <Modal open={open} title={title} onClose={onClose}>
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

export function FeasibilityDetailPage() {
  const { id } = useParams()
  const feasibilityId = Number(id)
  const { user } = useAuth()
  const allowWrite = canWriteDepartment(user, 'sales')
  const allowAdmin = isAdmin(user?.role)

  const [feasibility, setFeasibility] = useState<Feasibility | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const [approveOpen, setApproveOpen] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [closeOpen, setCloseOpen] = useState(false)
  const [adminReviewOpen, setAdminReviewOpen] = useState(false)
  const [stageResultsOpen, setStageResultsOpen] = useState(false)
  const [justDeleted, setJustDeleted] = useState(false)

  function load() {
    setLoading(true)
    getFeasibility(feasibilityId)
      .then(setFeasibility)
      .catch((err) => setError(getApiErrorMessage(err)))
      .finally(() => setLoading(false))
  }

  useEffect(load, [feasibilityId])

  async function withBusy(fn: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleRun() {
    await withBusy(async () => {
      const updated = await runFeasibilityCheck(feasibilityId)
      setFeasibility(updated)
      // The stage-by-stage dialog is the primary readout for a run -- it
      // walks through stock, then materials, then production line, each
      // marked pass/fail -- so there's no separate text banner to keep
      // in sync with it here.
      setStageResultsOpen(true)
    })
  }

  async function handleRevive() {
    await withBusy(async () => {
      const updated = await reviveFeasibility(feasibilityId)
      setFeasibility(updated)
      setNotice('Revived — back to draft. Run the check again whenever you\'re ready.')
    })
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

  if (!feasibility) {
    return (
      <AppLayout>
        <Alert variant="error">{error ?? 'Feasibility check not found.'}</Alert>
      </AppLayout>
    )
  }

  const f = feasibility

  return (
    <AppLayout>
      <PageHeader
        title={f.feasibility_number}
        subtitle={f.customer_name ?? undefined}
        actions={
          !justDeleted ? (
            <>
              {allowWrite && f.status === 'draft' && (
                <Button onClick={handleRun} isLoading={busy}>Run check</Button>
              )}
              {f.checked_at && (
                <Button variant="ghost" onClick={() => setStageResultsOpen(true)}>View check results</Button>
              )}
              {allowWrite && f.status === 'exception_pending' && (
                <>
                  <Button variant="ghost" onClick={() => setRejectOpen(true)}>Reject</Button>
                  <Button onClick={() => setApproveOpen(true)}>Override &amp; approve</Button>
                </>
              )}
              {allowWrite && (f.status === 'feasible' || f.status === 'exception_approved' || f.status === 'exception_rejected') && (
                <Button variant="ghost" onClick={() => setCloseOpen(true)}>Close without quotation</Button>
              )}
              {allowWrite && (f.status === 'converted' || f.status === 'closed' || f.status === 'exception_rejected' || f.status === 'expired') && (
                <Button variant="ghost" onClick={handleRevive} isLoading={busy}>Revive &amp; re-check</Button>
              )}
              {allowWrite && f.status !== 'converted' && (
                <Button variant="danger" onClick={() => setConfirmDeleteOpen(true)}>Delete</Button>
              )}
            </>
          ) : undefined
        }
      />

      <Alert variant="error">{error}</Alert>
      {notice && (
        <div className="mb-4 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {notice}
        </div>
      )}

      {f.admin_review_required && allowAdmin && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          <span>
            {f.admin_review_reason === 'override'
              ? 'Sales overrode an infeasible result on this check — needs admin review.'
              : 'This check has been open more than 5 days with no resolution — needs admin review.'}
          </span>
          <Button variant="ghost" size="sm" onClick={() => setAdminReviewOpen(true)}>Acknowledge</Button>
        </div>
      )}

      <GlassCard className="mb-6 p-8">
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <StatusBadge status={f.status} />
          {f.deal_number && (
            <Link
              to={`/deals/${f.deal_id}`}
              className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-white/50 hover:border-white/20 hover:text-white/70"
            >
              {f.deal_number}
            </Link>
          )}
        </div>

        <dl className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          <Field label="Required by">{formatDate(f.required_by_date)}</Field>
          <Field label="Checked at">{f.checked_at ? formatDateTime(f.checked_at) : 'Not yet run'}</Field>
          <Field label="Created">{formatDateTime(f.created_at)}</Field>
        </dl>

        {f.notes && (
          <div className="mt-6">
            <dt className="text-xs font-medium tracking-wide text-white/40 uppercase">Notes</dt>
            <dd className="mt-1 text-[15px] text-white/80">{f.notes}</dd>
          </div>
        )}
        {f.exception_reason && (
          <div className="mt-6">
            <dt className="text-xs font-medium tracking-wide text-white/40 uppercase">
              {f.status === 'exception_approved' ? 'Override comment' : 'Exception decision comment'}
            </dt>
            <dd className="mt-1 text-[15px] text-white/80">{f.exception_reason}</dd>
          </div>
        )}
        {f.close_reason && (
          <div className="mt-6">
            <dt className="text-xs font-medium tracking-wide text-white/40 uppercase">Close reason</dt>
            <dd className="mt-1 text-[15px] text-white/80">{f.close_reason}</dd>
          </div>
        )}
      </GlassCard>

      <GlassCard className="overflow-hidden">
        <div className="border-b border-white/10 px-6 py-4">
          <h2 className="font-display text-lg font-medium text-white">What's needed</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-xs tracking-wide text-white/40 uppercase">
                <th className="px-6 py-4 font-medium">Product</th>
                <th className="px-6 py-4 font-medium">Quantity</th>
                <th className="px-6 py-4 font-medium">Supply plan</th>
                <th className="px-6 py-4 font-medium">Materials</th>
                <th className="px-6 py-4 font-medium">Machine time</th>
              </tr>
            </thead>
            <tbody>
              {f.lines.map((line) => (
                <tr key={line.id} className="border-b border-white/5 last:border-0 align-top">
                  <td className="px-6 py-4 text-white">
                    {line.product_code ? `${line.product_code} — ${line.product_name}` : `#${line.product_id}`}
                  </td>
                  <td className="px-6 py-4 text-white/60">{line.quantity}</td>
                  <td className="px-6 py-4 text-xs">
                    {line.is_feasible === null ? (
                      <span className="text-white/40">Not yet run</span>
                    ) : (
                      <div className="space-y-1">
                        {line.covered_by_stock ? (
                          <p className="text-emerald-300">{line.covered_by_stock} ready in stock now</p>
                        ) : null}
                        {Math.max(line.quantity - (line.covered_by_stock ?? 0), 0) > 0 && (
                          <p className="text-white/60">
                            {Math.round((line.quantity - (line.covered_by_stock ?? 0)) * 10000) / 10000} to produce
                            {line.estimated_ready_date ? (
                              <> — supplied by {formatDate(line.estimated_ready_date)}</>
                            ) : line.shortfalls.length > 0 ? (
                              <span className="text-amber-300"> — date unknown until material shortfall is resolved</span>
                            ) : line.bom_missing ? (
                              <span className="text-amber-300"> — no formula to estimate from</span>
                            ) : (
                              <span className="text-white/40"> — not evaluable</span>
                            )}
                          </p>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {line.is_feasible === null ? (
                      <span className="text-white/40">Not yet run</span>
                    ) : line.is_feasible ? (
                      <StatusBadge status="feasible" />
                    ) : line.bom_missing ? (
                      <div>
                        <StatusBadge status="rejected" />
                        <p className="mt-2 text-xs text-amber-300">
                          No BOM (formula) set up for this product — feasibility can't be verified.{' '}
                          <Link to={`/products/${line.product_id}`} className="underline hover:text-amber-200">
                            Set it up
                          </Link>
                        </p>
                      </div>
                    ) : (
                      <div>
                        <StatusBadge status="rejected" />
                        <ul className="mt-2 space-y-1 text-xs text-white/60">
                          {line.shortfalls.map((s) => (
                            <li key={s.raw_material_id}>
                              {s.code} — short {s.shortfall} {s.unit} (need {s.required}, have {s.on_hand})
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {line.capacity_ok === null ? (
                      <span className="text-white/40">
                        {line.is_feasible === null ? 'Not yet run' : 'Not evaluated (no machine/formula set)'}
                      </span>
                    ) : line.capacity_ok ? (
                      <StatusBadge status="feasible" />
                    ) : (
                      <div>
                        <StatusBadge status="rejected" />
                        {line.capacity_shortfall && (
                          <p className="mt-2 text-xs text-white/60">
                            Not available:{' '}
                            {[
                              line.capacity_shortfall.machine_available
                                ? null
                                : `machine slot (${line.capacity_shortfall.machine}, needs ${line.capacity_shortfall.required_hours} hrs)`,
                              line.capacity_shortfall.workers_available === false
                                ? `manpower (needs ${line.capacity_shortfall.workers_required} workers)`
                                : null,
                            ]
                              .filter(Boolean)
                              .join(' and ') || line.capacity_shortfall.machine}
                            .{' '}
                            {line.capacity_shortfall.projected_completion_date ? (
                              <>
                                Earliest it could actually be done:{' '}
                                {formatDate(line.capacity_shortfall.projected_completion_date)}
                                {line.capacity_shortfall.shortfall_days
                                  ? ` (${line.capacity_shortfall.shortfall_days} day${line.capacity_shortfall.shortfall_days === 1 ? '' : 's'} late)`
                                  : ''}
                              </>
                            ) : (
                              'Not achievable within the next year at current bookings.'
                            )}
                          </p>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>

      <div className="mt-6">
        <HistoryTimeline resourcePath="/api/feasibility" id={feasibilityId} />
      </div>

      <div className="mt-6">
        <Link to="/feasibilities" className="text-sm text-white/50 hover:text-white">← Back to feasibility checks</Link>
      </div>

      <ConfirmDialog
        open={confirmDeleteOpen}
        title="Delete feasibility check"
        message={`Delete ${f.feasibility_number}? This can be undone immediately after, but not once you leave this page.`}
        confirmLabel="Delete"
        danger
        busy={busy}
        onConfirm={() =>
          withBusy(async () => {
            await deleteFeasibility(feasibilityId)
            setConfirmDeleteOpen(false)
            setJustDeleted(true)
            setNotice('Deleted.')
          })
        }
        onCancel={() => setConfirmDeleteOpen(false)}
      />

      <ReasonModal
        open={approveOpen}
        title="Override & approve"
        label="Why proceed despite the shortfall? (required — this notifies the admin)"
        confirmLabel="Approve override"
        onClose={() => setApproveOpen(false)}
        onSubmit={(reason) =>
          withBusy(async () => {
            const updated = await decideFeasibilityException(feasibilityId, true, reason)
            setFeasibility(updated)
            setApproveOpen(false)
            setNotice('Override approved — admin has been notified.')
          })
        }
      />

      <ReasonModal
        open={rejectOpen}
        title="Reject exception"
        label="Reason for rejecting"
        confirmLabel="Reject"
        onClose={() => setRejectOpen(false)}
        onSubmit={(reason) =>
          withBusy(async () => {
            const updated = await decideFeasibilityException(feasibilityId, false, reason)
            setFeasibility(updated)
            setRejectOpen(false)
            setNotice('Exception rejected.')
          })
        }
      />

      <ReasonModal
        open={closeOpen}
        title="Close without quotation"
        label="Reason for closing"
        confirmLabel="Close check"
        onClose={() => setCloseOpen(false)}
        onSubmit={(reason) =>
          withBusy(async () => {
            const updated = await closeFeasibility(feasibilityId, reason)
            setFeasibility(updated)
            setCloseOpen(false)
            setNotice('Closed.')
          })
        }
      />

      <FeasibilityStageResultsModal
        open={stageResultsOpen}
        feasibility={feasibility}
        onClose={() => setStageResultsOpen(false)}
      />

      <NotesModal
        open={adminReviewOpen}
        title="Acknowledge admin review"
        onClose={() => setAdminReviewOpen(false)}
        onSubmit={(notes) =>
          withBusy(async () => {
            const updated = await adminReviewFeasibility(feasibilityId, notes)
            setFeasibility(updated)
            setAdminReviewOpen(false)
            setNotice('Admin review acknowledged.')
          })
        }
      />
    </AppLayout>
  )
}
