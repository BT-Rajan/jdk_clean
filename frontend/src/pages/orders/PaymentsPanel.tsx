import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Alert, Button, ConfirmDialog, GlassCard, Modal, Spinner, TextField, TextareaField } from '@/components/ui'
import { createPayment, deletePayment, listPayments } from '@/api/payments'
import type { Payment } from '@/types/payment'
import { getApiErrorMessage } from '@/lib/apiError'
import { formatDate, formatDateTime } from '@/lib/dateFormat'
import { formatCurrency } from '@/lib/currency'
import { paymentSchema, todayDateInputMin, type PaymentFormValues, type PaymentSubmitValues } from '@/lib/validation'

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
    <Modal open={open} title="Record payment" onClose={onClose}>
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
          payment collection yet, this just records that it landed.
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

export function PaymentsPanel({
  orderId,
  orderTotal,
  allowWrite,
  allowAdmin,
}: {
  orderId: number
  orderTotal: number
  allowWrite: boolean
  allowAdmin: boolean
}) {
  const [payments, setPayments] = useState<Payment[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [recordOpen, setRecordOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Payment | null>(null)
  const [deleting, setDeleting] = useState(false)

  function load() {
    listPayments(orderId)
      .then(setPayments)
      .catch((err) => setError(getApiErrorMessage(err)))
  }

  useEffect(load, [orderId])

  const amountPaid = payments?.reduce((sum, p) => sum + p.amount, 0) ?? 0
  const balance = orderTotal - amountPaid

  return (
    <GlassCard className="p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-medium text-white">Payments</h2>
          {payments && (
            <p className="mt-1 text-sm text-white/50">
              {formatCurrency(amountPaid)} received of {formatCurrency(orderTotal)}
              {balance > 0.001 && <span className="text-amber-300"> — {formatCurrency(balance)} outstanding</span>}
            </p>
          )}
        </div>
        {allowWrite && <Button size="sm" onClick={() => setRecordOpen(true)}>Record payment</Button>}
      </div>

      <Alert variant="error">{error}</Alert>

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

      <RecordPaymentModal
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
