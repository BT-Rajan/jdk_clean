import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { Alert, Button, ConfirmDialog, Field, GlassCard, PageHeader, Spinner, StatusBadge } from '@/components/ui'
import { SendEmailDialog } from '@/components/documents/SendEmailDialog'
import { deleteOrder, downloadOrderPdf, emailOrder, getOrder, restoreOrder, updateOrderStatus } from '@/api/orders'
import type { Order } from '@/types/order'
import { getApiErrorMessage } from '@/lib/apiError'
import { formatDate } from '@/lib/dateFormat'
import { formatCurrency } from '@/lib/currency'
import { useAuth } from '@/hooks/useAuth'
import { canWriteDepartment } from '@/lib/roles'
import { ORDER_TRANSITIONS } from '@/lib/statusTransitions'
import { OrderJourney } from './OrderJourney'

export function OrderDetailPage() {
  const { id } = useParams()
  const orderId = Number(id)
  const navigate = useNavigate()
  const { user } = useAuth()
  const allowWrite = canWriteDepartment(user, 'sales')

  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [emailOpen, setEmailOpen] = useState(false)
  const [justDeleted, setJustDeleted] = useState(false)

  function load() {
    setLoading(true)
    getOrder(orderId)
      .then(setOrder)
      .catch((err) => setError(getApiErrorMessage(err)))
      .finally(() => setLoading(false))
  }

  useEffect(load, [orderId])

  async function handleStatusChange(status: (typeof ORDER_TRANSITIONS)['draft'][number]) {
    setBusy(true)
    setError(null)
    try {
      const updated = await updateOrderStatus(orderId, status)
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

      <GlassCard className="mb-6 p-8">
        <div className="mb-6 flex flex-wrap items-center gap-4">
          <StatusBadge status={order.status} />
          {allowWrite && nextStatuses.length > 0 && !justDeleted && (
            <div className="ml-auto flex gap-2">
              {nextStatuses.map((s) => (
                <Button key={s} variant="ghost" size="sm" isLoading={busy} onClick={() => handleStatusChange(s)}>
                  Mark {s.replace(/_/g, ' ')}
                </Button>
              ))}
            </div>
          )}
        </div>

        <dl className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          <Field label="Order date" value={formatDate(order.order_date)} />
          <Field label="Requested delivery" value={formatDate(order.requested_delivery_date)} />
          <Field label="Total" value={formatCurrency(order.total_amount)} />
        </dl>

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
    </AppLayout>
  )
}
