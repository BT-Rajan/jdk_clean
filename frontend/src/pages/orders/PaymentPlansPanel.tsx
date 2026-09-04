import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Alert, Button, ConfirmDialog, GlassCard, Modal, Spinner, TextField, TextareaField } from '@/components/ui'
import { createPaymentPlan, deletePaymentPlan, listPaymentPlans } from '@/api/paymentPlans'
import type { PaymentPlan } from '@/types/paymentPlan'
import { getApiErrorMessage } from '@/lib/apiError'
import { formatDate, formatDateTime } from '@/lib/dateFormat'
import { formatCurrency } from '@/lib/currency'
import { useAsyncGuard } from '@/hooks/useAsyncGuard'
import { paymentPlanSchema, todayDateInputMin, type PaymentPlanFormValues, type PaymentPlanSubmitValues } from '@/lib/validation'

function RecordPlanModal({
  open,
  orderId,
  onClose,
  onRecorded,
}: {
  open: boolean
  orderId: number
  onClose: () => void
  onRecorded: (plan: PaymentPlan) => void
}) {
  const [formError, setFormError] = useState<string | null>(null)
  const { busy: submitting, run: runGuarded } = useAsyncGuard()
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PaymentPlanFormValues, unknown, PaymentPlanSubmitValues>({
    resolver: zodResolver(paymentPlanSchema),
    defaultValues: { amount: undefined, target_date: todayDateInputMin, notes: '' },
  })

  useEffect(() => {
    if (open) {
      setFormError(null)
      reset({ amount: undefined, target_date: todayDateInputMin, notes: '' })
    }
  }, [open, reset])

  return (
    <Modal open={open} title="Record payment plan" onClose={onClose} wide>
      <form
        onSubmit={handleSubmit(async (values) => {
          setFormError(null)
          try {
            await runGuarded(async () => {
              const plan = await createPaymentPlan(orderId, values)
              onRecorded(plan)
            })
          } catch (err) {
            setFormError(getApiErrorMessage(err))
          }
        })}
        noValidate
        className="flex flex-col gap-4"
      >
        <p className="text-xs text-white/40">
          A commitment the customer has agreed to (by phone, email, in person) to settle this order by a given
          date -- for the record only. It doesn't reduce what counts against their credit limit; only an actual
          recorded payment or an admin's approval does that.
        </p>
        <Alert variant="error">{formError}</Alert>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField label="Amount" type="number" step="0.01" error={errors.amount?.message} {...register('amount')} />
          <TextField
            label="Target date"
            type="date"
            min={todayDateInputMin}
            error={errors.target_date?.message}
            {...register('target_date')}
          />
        </div>
        <TextareaField label="Notes (optional)" {...register('notes')} />
        <div className="mt-2 flex justify-end gap-3">
          <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" isLoading={submitting}>Record plan</Button>
        </div>
      </form>
    </Modal>
  )
}

export function PaymentPlansPanel({
  orderId,
  allowWrite,
  allowAdmin,
}: {
  orderId: number
  allowWrite: boolean
  allowAdmin: boolean
}) {
  const [plans, setPlans] = useState<PaymentPlan[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [recordOpen, setRecordOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<PaymentPlan | null>(null)
  const { busy: deleting, run: runGuarded } = useAsyncGuard()

  function load() {
    listPaymentPlans(orderId)
      .then(setPlans)
      .catch((err) => setError(getApiErrorMessage(err)))
  }

  useEffect(load, [orderId])

  return (
    <GlassCard className="p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-medium text-white">Payment plans</h2>
          <p className="mt-1 text-sm text-white/50">Agreed commitments to pay, on record -- see Payments for what's actually arrived.</p>
        </div>
        {allowWrite && <Button size="sm" onClick={() => setRecordOpen(true)}>Record plan</Button>}
      </div>

      <Alert variant="error">{error}</Alert>

      {plans === null ? (
        <div className="flex justify-center py-8">
          <Spinner size={20} className="text-gold-300" />
        </div>
      ) : plans.length === 0 ? (
        <p className="text-sm text-white/40">No payment plans recorded yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {plans.map((p) => (
            <div
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm"
            >
              <div>
                <p className="text-white">
                  {formatCurrency(p.amount)} <span className="text-white/50">by {formatDate(p.target_date)}</span>
                </p>
                <p className="mt-0.5 text-xs text-white/40">
                  recorded {formatDateTime(p.created_at)}
                  {p.recorded_by_name && ` by ${p.recorded_by_name}`}
                </p>
                {p.notes && <p className="mt-1 text-xs text-white/50">{p.notes}</p>}
              </div>
              {allowAdmin && (
                <button
                  type="button"
                  onClick={() => setDeleteTarget(p)}
                  className="shrink-0 text-xs font-medium text-red-300 hover:text-red-200"
                >
                  Reverse
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <RecordPlanModal
        open={recordOpen}
        orderId={orderId}
        onClose={() => setRecordOpen(false)}
        onRecorded={() => {
          setRecordOpen(false)
          load()
        }}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Reverse payment plan"
        message={`Reverse the ${deleteTarget ? formatCurrency(deleteTarget.amount) : ''} plan recorded for ${
          deleteTarget ? formatDate(deleteTarget.target_date) : ''
        }?`}
        confirmLabel="Reverse"
        danger
        busy={deleting}
        onConfirm={async () => {
          if (!deleteTarget) return
          try {
            await runGuarded(async () => {
              await deletePaymentPlan(orderId, deleteTarget.id)
              setDeleteTarget(null)
              load()
            })
          } catch (err) {
            setError(getApiErrorMessage(err))
          }
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </GlassCard>
  )
}
