import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Alert, Button, ConfirmDialog, GlassCard, KdIcon, Modal, SelectField, Spinner, TextField, TextareaField } from '@/components/ui'
import {
  acknowledgePayment,
  createPayment,
  deletePayment,
  getOrderPaymentStatus,
  listPayments,
  overridePaymentGate,
  setPaymentFollowup,
} from '@/api/payments'
import { listUsers } from '@/api/users'
import type { Payment, OrderPaymentStatus } from '@/types/payment'
import type { User } from '@/types/auth'
import { getApiErrorMessage } from '@/lib/apiError'
import { formatDate, formatDateTime } from '@/lib/dateFormat'
import { formatCurrency } from '@/lib/currency'
import { useAsyncGuard } from '@/hooks/useAsyncGuard'
import {
  paymentOverrideSchema,
  paymentSchema,
  todayDateInputMin,
  type PaymentFormValues,
  type PaymentOverrideFormValues,
  type PaymentOverrideSubmitValues,
  type PaymentSubmitValues,
} from '@/lib/validation'

function RecordPaymentModal({
  open,
  orderId,
  onClose,
  onRecorded,
}: {
  open: boolean
  orderId: number
  onClose: () => void
  onRecorded: (payment: Payment) => void
}) {
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PaymentFormValues, unknown, PaymentSubmitValues>({
    resolver: zodResolver(paymentSchema),
    defaultValues: { amount: undefined, payment_date: todayDateInputMin, method: '', reference: '', notes: '' },
  })

  useEffect(() => {
    if (open) {
      setFormError(null)
      reset({ amount: undefined, payment_date: todayDateInputMin, method: '', reference: '', notes: '' })
    }
  }, [open, reset])

  return (
    <Modal open={open} title="Record payment" onClose={onClose} wide>
      <form
        onSubmit={handleSubmit(async (values) => {
          setFormError(null)
          try {
            const payment = await createPayment(orderId, values)
            onRecorded(payment)
          } catch (err) {
            setFormError(getApiErrorMessage(err))
          }
        })}
        noValidate
        className="flex flex-col gap-4"
      >
        <p className="text-xs text-white/40">
          For money that's already arrived outside the app (bank transfer, cheque, cash) -- there's no online
          payment collection yet, this just records that it landed. A reference is required for any method other
          than cash, and Finance will still need to acknowledge it before it counts toward unblocking production.
        </p>
        <Alert variant="error">{formError}</Alert>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField label="Amount" type="number" step="0.01" error={errors.amount?.message} {...register('amount')} />
          <TextField
            label="Payment date"
            type="date"
            max={todayDateInputMin}
            error={errors.payment_date?.message}
            {...register('payment_date')}
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField label="Method" placeholder="Bank transfer, cheque, cash…" {...register('method')} />
          <TextField label="Reference" placeholder="Bank ref / cheque no." {...register('reference')} />
        </div>
        <TextareaField label="Notes (optional)" {...register('notes')} />
        <div className="mt-2 flex justify-end gap-3">
          <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" isLoading={isSubmitting}>Record payment</Button>
        </div>
      </form>
    </Modal>
  )
}

function OverrideGateModal({
  open,
  orderId,
  status,
  onClose,
  onOverridden,
}: {
  open: boolean
  orderId: number
  status: OrderPaymentStatus | null
  onClose: () => void
  onOverridden: () => void
}) {
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PaymentOverrideFormValues, unknown, PaymentOverrideSubmitValues>({
    resolver: zodResolver(paymentOverrideSchema),
    defaultValues: { reason: '' },
  })

  useEffect(() => {
    if (open) {
      setFormError(null)
      reset({ reason: '' })
    }
  }, [open, reset])

  return (
    <Modal open={open} title="Override payment gate" onClose={onClose} wide>
      <form
        onSubmit={handleSubmit(async (values) => {
          setFormError(null)
          try {
            await overridePaymentGate(orderId, values)
            onOverridden()
          } catch (err) {
            setFormError(getApiErrorMessage(err))
          }
        })}
        noValidate
        className="flex flex-col gap-4"
      >
        <p className="text-sm text-white/70">
          The acknowledged amount ({status ? formatCurrency(status.amount_acknowledged) : '—'}) is less than this
          order's total ({status ? formatCurrency(status.total_amount) : '—'}). This customer has no credit
          facility, so production is blocked until it's paid in full -- confirm below to let it proceed anyway.
        </p>
        <Alert variant="error">{formError}</Alert>
        <TextareaField label="Reason" error={errors.reason?.message} {...register('reason')} />
        <div className="mt-2 flex justify-end gap-3">
          <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" isLoading={isSubmitting}>Confirm override</Button>
        </div>
      </form>
    </Modal>
  )
}

function FollowupControls({
  orderId,
  status,
  onUpdated,
}: {
  orderId: number
  status: OrderPaymentStatus
  onUpdated: () => void
}) {
  const [users, setUsers] = useState<User[] | null>(null)
  const [ownerId, setOwnerId] = useState<string>(status.payment_followup_owner_id?.toString() ?? '')
  const [followupDate, setFollowupDate] = useState<string>(status.payment_followup_date ?? '')
  const [error, setError] = useState<string | null>(null)
  const { busy: saving, run: runGuarded } = useAsyncGuard()

  useEffect(() => {
    listUsers({ page: 1, page_size: 200 })
      .then((res) => setUsers(res.items))
      .catch(() => setUsers([]))
  }, [])

  useEffect(() => {
    setOwnerId(status.payment_followup_owner_id?.toString() ?? '')
    setFollowupDate(status.payment_followup_date ?? '')
  }, [status.payment_followup_owner_id, status.payment_followup_date])

  return (
    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto]">
      <SelectField label="Follow-up owner" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
        <option value="">Unassigned</option>
        {users?.map((u) => (
          <option key={u.id} value={u.id}>{u.full_name}</option>
        ))}
      </SelectField>
      <TextField
        label="Next follow-up date"
        type="date"
        value={followupDate}
        onChange={(e) => setFollowupDate(e.target.value)}
      />
      <div className="flex items-end">
        <Button
          size="sm"
          isLoading={saving}
          onClick={() =>
            runGuarded(async () => {
              setError(null)
              try {
                await setPaymentFollowup(orderId, {
                  owner_id: ownerId ? Number(ownerId) : null,
                  followup_date: followupDate || null,
                })
                onUpdated()
              } catch (err) {
                setError(getApiErrorMessage(err))
              }
            })
          }
        >
          Save
        </Button>
      </div>
      {error && <p className="sm:col-span-3 text-xs text-red-400">{error}</p>}
    </div>
  )
}

export function PaymentsPanel({
  orderId,
  allowWrite,
  allowAdmin,
  allowFinance,
}: {
  orderId: number
  orderTotal: number
  allowWrite: boolean
  allowAdmin: boolean
  allowFinance: boolean
}) {
  const [payments, setPayments] = useState<Payment[] | null>(null)
  const [status, setStatus] = useState<OrderPaymentStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [recordOpen, setRecordOpen] = useState(false)
  const [overrideOpen, setOverrideOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Payment | null>(null)
  const [deleting, setDeleting] = useState(false)
  const { run: runGuarded } = useAsyncGuard()

  function load() {
    listPayments(orderId)
      .then(setPayments)
      .catch((err) => setError(getApiErrorMessage(err)))
    getOrderPaymentStatus(orderId)
      .then(setStatus)
      .catch((err) => setError(getApiErrorMessage(err)))
  }

  useEffect(load, [orderId])

  return (
    <GlassCard className="p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-medium text-white">Payments</h2>
          {status && (
            <p className="mt-1 text-sm text-white/50">
              {formatCurrency(status.amount_paid)} claimed ({formatCurrency(status.amount_acknowledged)} acknowledged) of{' '}
              {formatCurrency(status.total_amount)}
              {status.outstanding_balance > 0.001 && (
                <span className="text-amber-300"> — {formatCurrency(status.outstanding_balance)} outstanding</span>
              )}
            </p>
          )}
          {status && (
            <p className="mt-1 text-xs text-white/40">
              Due {formatDate(status.due_date)}
              {status.overdue_days > 0 && <span className="text-red-300"> · {status.overdue_days} day(s) overdue</span>}
              {status.has_credit_facility && <span> · has credit facility</span>}
            </p>
          )}
        </div>
        {allowWrite && (
          <Button
            size="sm"
            className="!w-9 !px-0"
            onClick={() => setRecordOpen(true)}
            aria-label="Record payment"
          >
            <KdIcon />
          </Button>
        )}
      </div>

      <Alert variant="error">{error}</Alert>

      {status?.production_block_reason && (
        <div className="mb-4 rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
          <p>{status.production_block_reason}</p>
          {status.payment_override_at ? (
            <p className="mt-1 text-xs text-amber-200/70">
              Overridden {formatDateTime(status.payment_override_at)}
              {status.payment_override_reason && ` — ${status.payment_override_reason}`}
            </p>
          ) : (
            allowFinance && (
              <Button size="sm" variant="ghost" className="mt-2" onClick={() => setOverrideOpen(true)}>
                Override
              </Button>
            )
          )}
        </div>
      )}

      {payments === null ? (
        <div className="flex justify-center py-8">
          <Spinner size={20} className="text-gold-300" />
        </div>
      ) : payments.length === 0 ? (
        <p className="text-sm text-white/40">No payments recorded yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {payments.map((p) => (
            <div
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm"
            >
              <div>
                <p className="text-white">
                  {formatCurrency(p.amount)}
                  {p.method && <span className="text-white/50"> — {p.method}</span>}
                  {p.reference && <span className="text-white/40"> ({p.reference})</span>}
                </p>
                <p className="mt-0.5 text-xs text-white/40">
                  {formatDate(p.payment_date)} · recorded {formatDateTime(p.created_at)}
                  {p.recorded_by_name && ` by ${p.recorded_by_name}`}
                </p>
                {p.acknowledged_at ? (
                  <p className="mt-0.5 text-xs text-emerald-300">
                    Acknowledged {formatDateTime(p.acknowledged_at)}
                    {p.acknowledged_by_name && ` by ${p.acknowledged_by_name}`}
                  </p>
                ) : (
                  <p className="mt-0.5 text-xs text-amber-300">Not yet acknowledged by Finance</p>
                )}
                {p.notes && <p className="mt-1 text-xs text-white/50">{p.notes}</p>}
              </div>
              <div className="flex shrink-0 items-center gap-3">
                {!p.acknowledged_at && allowFinance && (
                  <button
                    type="button"
                    onClick={() =>
                      runGuarded(async () => {
                        try {
                          await acknowledgePayment(orderId, p.id)
                          load()
                        } catch (err) {
                          setError(getApiErrorMessage(err))
                        }
                      })
                    }
                    className="text-xs font-medium text-emerald-300 hover:text-emerald-200"
                  >
                    Acknowledge
                  </button>
                )}
                {allowAdmin && (
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(p)}
                    className="text-xs font-medium text-red-300 hover:text-red-200"
                  >
                    Reverse
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {status && allowFinance && (
        <FollowupControls orderId={orderId} status={status} onUpdated={load} />
      )}

      <RecordPaymentModal
        open={recordOpen}
        orderId={orderId}
        onClose={() => setRecordOpen(false)}
        onRecorded={() => {
          setRecordOpen(false)
          load()
        }}
      />

      <OverrideGateModal
        open={overrideOpen}
        orderId={orderId}
        status={status}
        onClose={() => setOverrideOpen(false)}
        onOverridden={() => {
          setOverrideOpen(false)
          load()
        }}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Reverse payment"
        message={`Reverse the ${deleteTarget ? formatCurrency(deleteTarget.amount) : ''} payment recorded ${
          deleteTarget ? formatDate(deleteTarget.payment_date) : ''
        }? This adds it back to the customer's outstanding balance.`}
        confirmLabel="Reverse"
        danger
        busy={deleting}
        onConfirm={async () => {
          if (!deleteTarget) return
          setDeleting(true)
          try {
            await deletePayment(orderId, deleteTarget.id)
            setDeleteTarget(null)
            load()
          } catch (err) {
            setError(getApiErrorMessage(err))
          } finally {
            setDeleting(false)
          }
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </GlassCard>
  )
}
