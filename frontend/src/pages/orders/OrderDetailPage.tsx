import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { Alert, Button, ConfirmDialog, Field, GlassCard, Modal, PageHeader, Spinner, StatusBadge, TextareaField } from '@/components/ui'
import { SendEmailDialog } from '@/components/documents/SendEmailDialog'
import { adminReviewOrder, deleteOrder, downloadOrderPdf, emailOrder, getOrder, restoreOrder, updateOrderStatus } from '@/api/orders'
import type { Order } from '@/types/order'
import { getApiErrorMessage } from '@/lib/apiError'
import { formatDate } from '@/lib/dateFormat'
import { formatCurrency } from '@/lib/currency'
import { HistoryTimeline } from '@/components/history/HistoryTimeline'
import { useAuth } from '@/hooks/useAuth'
import { canWriteDepartment, isAdmin } from '@/lib/roles'
import { ORDER_STATUSES_REQUIRING_REASON, ORDER_TRANSITIONS } from '@/lib/statusTransitions'
import { StatusTransitionButtons } from '@/components/status/StatusTransitionButtons'
import { orderAdminReviewSchema, type OrderAdminReviewFormValues } from '@/lib/validation'
import { OrderJourney } from './OrderJourney'

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
  } = useForm<OrderAdminReviewFormValues>({ resolver: zodResolver(orderAdminReviewSchema) })

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

export function OrderDetailPage() {
  const { id } = useParams()
  const orderId = Number(id)
  const navigate = useNavigate()
  const { user } = useAuth()
  const allowWrite = canWriteDepartment(user, 'sales')
  const allowAdmin = isAdmin(user?.role)

  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [emailOpen, setEmailOpen] = useState(false)
  const [adminReviewOpen, setAdminReviewOpen] = useState(false)
  const [justDeleted, setJustDeleted] = useState(false)

  function load() {
    setLoading(true)
    getOrder(orderId)
      .then(setOrder)
      .catch((err) => setError(getApiErrorMessage(err)))
      .finally(() => setLoading(false))
  }

  useEffect(load, [orderId])

  async function handleStatusChange(status: (typeof ORDER_TRANSITIONS)['draft'][number], reason?: string) {
    setBusy(true)
    setError(null)
    try {
      const updated = await updateOrderStatus(orderId, status, reason)
      setOrder(updated)
      setNotice(`Status changed to ${status}.`)
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    setBusy(true)
    try {
      await deleteOrder(orderId)
      setConfirmOpen(false)
      setJustDeleted(true)
      setNotice('Order deleted.')
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleRestore() {
    setBusy(true)
    try {
      const restored = await restoreOrder(orderId)
      setOrder(restored)
      setJustDeleted(false)
      setNotice('Order restored.')
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleDownload() {
    if (!order) return
    setBusy(true)
    try {
      await downloadOrderPdf(order.id, order.order_number)
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

  if (!order) {
    return (
      <AppLayout>
        <Alert variant="error">{error ?? 'Order not found.'}</Alert>
      </AppLayout>
    )
  }

  const nextStatuses = ORDER_TRANSITIONS[order.status]

  return (
    <AppLayout>
      <PageHeader
        title={order.order_number}
        subtitle={order.customer_name ?? undefined}
        actions={
          !justDeleted ? (
            <>
              <Button variant="ghost" onClick={handleDownload} isLoading={busy}>Download PDF</Button>
              <Button variant="ghost" onClick={() => setEmailOpen(true)}>Send email</Button>
              {allowWrite && order.status === 'draft' && (
                <Button variant="ghost" onClick={() => navigate(`/orders/${orderId}/edit`)}>Edit</Button>
              )}
              {allowWrite && order.status === 'draft' && (
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

      {order.admin_review_required && allowAdmin && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          <span>This order is flagged for admin review.</span>
          <Button variant="ghost" size="sm" onClick={() => setAdminReviewOpen(true)}>Acknowledge</Button>
        </div>
      )}

      <GlassCard className="mb-6 p-8">
        <div className="mb-6 flex flex-wrap items-center gap-4">
          <StatusBadge status={order.status} />
          {order.deal_number && (
            <Link
              to={`/deals/${order.deal_id}`}
              className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-white/50 hover:border-white/20 hover:text-white/70"
            >
              {order.deal_number}
            </Link>
          )}
          {allowWrite && nextStatuses.length > 0 && !justDeleted && (
            <div className="ml-auto">
              <StatusTransitionButtons
                nextStatuses={nextStatuses}
                reasonRequiredFor={ORDER_STATUSES_REQUIRING_REASON}
                reasonLabel="Reason for cancelling"
                busy={busy}
                onChange={handleStatusChange}
              />
            </div>
          )}
        </div>

        <dl className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          <Field label="Order date" value={formatDate(order.order_date)} />
          <Field label="Requested delivery" value={formatDate(order.requested_delivery_date)} />
          <Field label="Total" value={formatCurrency(order.total_amount)} />
        </dl>
        {order.tax_rate > 0 && (
          <p className="mt-3 text-xs text-white/40">
            Subtotal {formatCurrency(order.subtotal_amount)} + {order.tax_rate}% tax ({formatCurrency(order.tax_amount)}) ={' '}
            {formatCurrency(order.total_amount)}
          </p>
        )}

        {order.notes && (
          <div className="mt-6">
            <Field label="Notes" value={order.notes} />
          </div>
        )}
      </GlassCard>

      <GlassCard className="overflow-hidden">
        <div className="border-b border-white/10 px-6 py-4">
          <h2 className="font-display text-lg font-medium text-white">Line items</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-xs tracking-wide text-white/40 uppercase">
                <th className="px-6 py-4 font-medium">Product</th>
                <th className="px-6 py-4 font-medium">Quantity</th>
                <th className="px-6 py-4 font-medium">Unit price</th>
                <th className="px-6 py-4 font-medium">Line total</th>
              </tr>
            </thead>
            <tbody>
              {order.lines.map((line) => (
                <tr key={line.id} className="border-b border-white/5 last:border-0">
                  <td className="px-6 py-4 text-white">
                    {line.product_code ? `${line.product_code} — ${line.product_name}` : `#${line.product_id}`}
                  </td>
                  <td className="px-6 py-4 text-white/60">{line.quantity} {line.unit}</td>
                  <td className="px-6 py-4 text-white/60">{formatCurrency(line.unit_price)}</td>
                  <td className="px-6 py-4 text-white/60">{formatCurrency(line.line_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>

      <div className="mt-6">
        <OrderJourney orderId={orderId} />
      </div>

      <div className="mt-6">
        <HistoryTimeline resourcePath="/api/orders" id={orderId} />
      </div>

      <div className="mt-6">
        <Link to="/orders" className="text-sm text-white/50 hover:text-white">← Back to orders</Link>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Delete order"
        message={`Delete ${order.order_number}? This can be undone immediately after, but not once you leave this page.`}
        confirmLabel="Delete"
        danger
        busy={busy}
        onConfirm={handleDelete}
        onCancel={() => setConfirmOpen(false)}
      />

      <SendEmailDialog
        open={emailOpen}
        title={`Email ${order.order_number}`}
        defaultEmail={order.customer_email}
        onClose={() => setEmailOpen(false)}
        onSend={async (toEmail, message) => {
          await emailOrder(order.id, toEmail, message)
          setNotice(`Emailed to ${toEmail}.`)
        }}
      />

      <AdminReviewModal
        open={adminReviewOpen}
        onClose={() => setAdminReviewOpen(false)}
        onSubmit={async (notes) => {
          setBusy(true)
          try {
            const updated = await adminReviewOrder(orderId, notes)
            setOrder(updated)
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
