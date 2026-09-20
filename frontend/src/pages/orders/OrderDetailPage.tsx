import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { useClientPagination } from '@/hooks/useClientPagination'
import { Alert, BanknoteIcon, Badge, Button, ConfirmDialog, DeleteIcon, DownloadMenu, EditIcon, EmailIcon, Field, GlassCard, Modal, MovingCartIcon, PageHeader, Pagination, Spinner, StatusBadge, TabPanel, Tabs, TextareaField, TextField, ThumbsUpIcon, TornPaperIcon } from '@/components/ui'
import type { TabItem } from '@/components/ui'
import { SendEmailDialog } from '@/components/documents/SendEmailDialog'
import {
  adminReviewOrder,
  approveOrder,
  changeOrderDeliveryDate,
  deleteOrder,
  downloadOrderDocx,
  downloadOrderPdf,
  emailOrder,
  getOrder,
  getOrderConfirmCheck,
  getOrderFulfillment,
  requestPayment,
  restoreOrder,
  splitOrder,
  updateOrderStatus,
  type OrderBlockStatus,
} from '@/api/orders'
import { createDeliveryNote, listDeliveryNotes } from '@/api/deliveryNotes'
import { listProductionOrders } from '@/api/productionOrders'
import { listQcRequests } from '@/api/qcRequests'
import { todayDateInputMin } from '@/lib/validation'
import { PaymentsPanel } from './PaymentsPanel'
import { PaymentPlansPanel } from './PaymentPlansPanel'
import { CreateProductionOrderModal } from './CreateProductionOrderModal'
import type { Order, OrderCancellationEffects, OrderFulfillmentLine } from '@/types/order'
import type { DeliveryNote } from '@/types/deliveryNote'
import type { ProductionOrder } from '@/types/productionOrder'
import type { QcRequest } from '@/types/qcRequest'
import { getApiErrorMessage } from '@/lib/apiError'
import { formatDate } from '@/lib/dateFormat'
import { formatCurrency } from '@/lib/currency'
import { HistoryTimeline } from '@/components/history/HistoryTimeline'
import { useAuth } from '@/hooks/useAuth'
import { canWriteDepartment, canWritePage, isAdmin } from '@/lib/roles'
import { ORDER_STATUSES_REQUIRING_REASON, ORDER_TRANSITIONS } from '@/lib/statusTransitions'
import { StatusTransitionButtons } from '@/components/status/StatusTransitionButtons'
import { orderAdminReviewSchema, type OrderAdminReviewFormValues } from '@/lib/validation'
import { OrderJourney } from './OrderJourney'

/** Turns what a cancellation took down with it into a short trailing
 * clause for the status-change notice -- so cancelling an order shows
 * which production batches, reservations and deliveries it just
 * cancelled instead of a bare "Status changed to cancelled." */
function describeCancellationEffects(effects: OrderCancellationEffects | null): string {
  if (!effects) return ''
  const parts: string[] = []
  if (effects.cancelled_production_batches.length > 0) {
    parts.push(
      `production batch(es) ${effects.cancelled_production_batches.map((b) => b.batch_number).join(', ')} cancelled`,
    )
  }
  if (effects.released_reservations.length > 0) {
    parts.push(
      `stock reservation(s) released for ${effects.released_reservations
        .map((r) => `${r.quantity} × ${r.product_name ?? `product #${r.product_id}`}`)
        .join(', ')}`,
    )
  }
  if (effects.cancelled_delivery_notes.length > 0) {
    parts.push(
      `delivery note(s) ${effects.cancelled_delivery_notes.map((d) => d.delivery_note_number).join(', ')} reversed`,
    )
  }
  return parts.length > 0 ? ` As a result: ${parts.join('; ')}.` : ''
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

function SplitOrderModal({
  open,
  order,
  onClose,
  onSplit,
}: {
  open: boolean
  order: Order
  onClose: () => void
  onSplit: (child: Order) => void
}) {
  const [quantities, setQuantities] = useState<Record<number, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setQuantities({})
      setFormError(null)
    }
  }, [open])

  async function handleSubmit() {
    setFormError(null)
    const lines = order.lines
      .map((line) => ({ order_detail_id: line.id, quantity: Number(quantities[line.id] || 0) }))
      .filter((line) => line.quantity > 0)
    if (lines.length === 0) {
      setFormError('Enter a quantity to split for at least one line.')
      return
    }
    for (const line of lines) {
      const source = order.lines.find((l) => l.id === line.order_detail_id)
      if (source && line.quantity > source.quantity) {
        setFormError(`Can't split more than what's on the line (${source.quantity} ${source.unit ?? ''}).`)
        return
      }
    }
    setSubmitting(true)
    try {
      const child = await splitOrder(order.id, lines)
      onSplit(child)
    } catch (err) {
      setFormError(getApiErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} title={`Split ${order.order_number}`} onClose={onClose} wide>
      <div className="flex flex-col gap-4">
        <p className="text-xs text-white/40">
          Stock only covers part of this order right now? Enter how much of each line can actually go out today --
          that becomes a new order, delivered on its own, while the rest stays on {order.order_number} for when more
          stock is in.
        </p>
        <Alert variant="error">{formError}</Alert>
        <div className="flex flex-col gap-3">
          {order.lines.map((line) => (
            <div key={line.id} className="grid grid-cols-1 gap-3 rounded-xl border border-white/10 p-4 sm:grid-cols-3 sm:items-end">
              <div className="sm:col-span-2 text-sm text-white">
                {line.product_code ? `${line.product_code} — ${line.product_name}` : `#${line.product_id}`}
                <p className="mt-1 text-xs text-white/40">{line.quantity} {line.unit} on this order</p>
              </div>
              <TextField
                label="Split quantity"
                type="number"
                step="0.0001"
                min="0"
                max={line.quantity}
                value={quantities[line.id] ?? ''}
                onChange={(e) => setQuantities((prev) => ({ ...prev, [line.id]: e.target.value }))}
              />
            </div>
          ))}
        </div>
        <div className="mt-2 flex justify-end gap-3">
          <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
          <Button type="button" isLoading={submitting} onClick={handleSubmit}>Split order</Button>
        </div>
      </div>
    </Modal>
  )
}

function DeliveryDateChangeModal({
  open,
  order,
  onClose,
  onChanged,
}: {
  open: boolean
  order: Order
  onClose: () => void
  onChanged: (updated: Order) => void
}) {
  const [newDate, setNewDate] = useState('')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setNewDate(order.confirmed_delivery_date ?? '')
      setReason('')
      setFormError(null)
    }
  }, [open, order.confirmed_delivery_date])

  async function handleSubmit() {
    setFormError(null)
    if (!newDate) {
      setFormError('Choose a new delivery date.')
      return
    }
    if (!reason.trim()) {
      setFormError('A reason is required to change a confirmed delivery date.')
      return
    }
    setSubmitting(true)
    try {
      const updated = await changeOrderDeliveryDate(order.id, newDate, reason.trim())
      onChanged(updated)
    } catch (err) {
      setFormError(getApiErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} title="Change confirmed delivery date" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="text-xs text-white/40">
          This date is what production/delivery planning are working to. Changing it is recorded in this
          order's history, so say why the commitment is moving.
        </p>
        <Alert variant="error">{formError}</Alert>
        <TextField
          label="New confirmed delivery date"
          type="date"
          min={todayDateInputMin}
          value={newDate}
          onChange={(e) => setNewDate(e.target.value)}
        />
        <TextareaField
          label="Reason for change"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <div className="mt-2 flex justify-end gap-3">
          <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
          <Button type="button" isLoading={submitting} onClick={handleSubmit}>Save new date</Button>
        </div>
      </div>
    </Modal>
  )
}

function buildTabs(counts: {
  lines: number
  hasFulfillment: boolean
  productionOrders: number
  deliveryNotes: number
}): TabItem[] {
  const badge = (n: number) => (n > 0 ? n : undefined)
  return [
    { id: 'lines', label: 'Line items', badge: badge(counts.lines) },
    // Only meaningful once the order has fulfilment rows to show.
    ...(counts.hasFulfillment ? [{ id: 'fulfilment', label: 'Fulfilment' }] : []),
    { id: 'production', label: 'Production', badge: badge(counts.productionOrders) },
    { id: 'delivery', label: 'Delivery', badge: badge(counts.deliveryNotes) },
    { id: 'payments', label: 'Payments' },
    { id: 'journey', label: 'Journey' },
    { id: 'history', label: 'History' },
  ]
}

export function OrderDetailPage() {
  const { id } = useParams()
  const orderId = Number(id)
  const navigate = useNavigate()
  const { user, permissions } = useAuth()
  const allowWrite = canWriteDepartment(user, 'sales')
  const allowAdmin = isAdmin(user?.role)
  // Finance's own actions (acknowledging a payment, overriding the
  // production gate, setting a follow-up, completing a plan) are gated
  // by the "payments" page_key rather than the fixed 'sales' department
  // canWriteDepartment assumes -- Finance is an admin-created department
  // like any other, not one of the handful this shortcut hardcodes.
  const allowFinance = canWritePage(permissions, 'payments')

  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [emailOpen, setEmailOpen] = useState(false)
  const [paymentEmailOpen, setPaymentEmailOpen] = useState(false)
  const [adminReviewOpen, setAdminReviewOpen] = useState(false)
  const [splitOpen, setSplitOpen] = useState(false)
  const [productionOrderModalOpen, setProductionOrderModalOpen] = useState(false)
  const [justDeleted, setJustDeleted] = useState(false)
  // An order can now be shipped across more than one delivery note
  // (multiple trucks/dates) -- see delivery_note_service.py's
  // ELIGIBLE_ORDER_STATUSES -- so this tracks every note issued against
  // it, not just a single "the" note.
  const [deliveryNotes, setDeliveryNotes] = useState<DeliveryNote[]>([])
  const [productionOrders, setProductionOrders] = useState<ProductionOrder[]>([])
  const [fulfillment, setFulfillment] = useState<OrderFulfillmentLine[]>([])
  // QC state per production order, keyed by production_order_id -- QC has
  // no list page of its own (only reachable from a Production Order's own
  // detail page), so this surfaces just enough to answer "is this order's
  // production waiting on QC" without building one.
  const [qcByProductionOrder, setQcByProductionOrder] = useState<Record<number, QcRequest[]>>({})
  const [blockStatus, setBlockStatus] = useState<OrderBlockStatus | null>(null)
  const productionOrdersPager = useClientPagination(productionOrders)
  const deliveryNotesPager = useClientPagination(deliveryNotes)
  const childOrdersPager = useClientPagination(order?.child_orders)
  const [deliveryDateOpen, setDeliveryDateOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('lines')

  function load() {
    setLoading(true)
    getOrder(orderId)
      .then(setOrder)
      .catch((err) => setError(getApiErrorMessage(err)))
      .finally(() => setLoading(false))
  }

  function loadBlockStatus() {
    getOrderConfirmCheck(orderId)
      .then(setBlockStatus)
      .catch(() => setBlockStatus(null))
  }

  useEffect(loadBlockStatus, [orderId])

  function loadDeliveryNotes() {
    listDeliveryNotes({ order_id: orderId, page: 1, page_size: 50 })
      .then((result) => setDeliveryNotes(result.items))
      .catch(() => setDeliveryNotes([]))
  }

  function loadProductionOrders() {
    listProductionOrders({ order_id: orderId, page: 1, page_size: 50 })
      .then((result) => {
        setProductionOrders(result.items)
        return Promise.all(
          result.items.map((po) =>
            listQcRequests({ production_order_id: po.id, page: 1, page_size: 10 })
              .then((r) => [po.id, r.items] as const)
              .catch(() => [po.id, []] as const),
          ),
        )
      })
      .then((entries) => entries && setQcByProductionOrder(Object.fromEntries(entries)))
      .catch(() => setProductionOrders([]))
  }

  function loadFulfillment() {
    getOrderFulfillment(orderId)
      .then(setFulfillment)
      .catch(() => setFulfillment([]))
  }

  useEffect(load, [orderId])
  useEffect(loadDeliveryNotes, [orderId])
  useEffect(loadProductionOrders, [orderId])
  useEffect(loadFulfillment, [orderId])

  async function handleStatusChange(status: (typeof ORDER_TRANSITIONS)['draft'][number], reason?: string) {
    setBusy(true)
    setError(null)
    try {
      const updated = await updateOrderStatus(orderId, status, reason)
      setOrder(updated)
      setNotice(`Status changed to ${status}.${describeCancellationEffects(updated.cancellation_effects)}`)
      loadFulfillment()
      loadBlockStatus()
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleApprove() {
    setBusy(true)
    setError(null)
    try {
      const updated = await approveOrder(orderId)
      setOrder(updated)
      setNotice('Approved.')
      loadBlockStatus()
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

  async function handleDownloadDocx(language: 'en' | 'ar') {
    if (!order) return
    setBusy(true)
    try {
      await downloadOrderDocx(order.id, order.order_number, language)
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleCreateDeliveryNote() {
    setBusy(true)
    setError(null)
    try {
      // Lines are omitted -- delivery_note_service defaults them to
      // whatever's still outstanding on the order, so this works the
      // same whether it's the first note or another one covering the
      // remainder of an already-'shipped' order.
      const note = await createDeliveryNote({ order_id: orderId, delivery_date: todayDateInputMin })
      navigate(`/delivery-notes/${note.id}`)
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
  const hasFulfillment = fulfillment.length > 0
  const tabs = buildTabs({
    lines: order.lines.length,
    hasFulfillment,
    productionOrders: productionOrders.length,
    deliveryNotes: deliveryNotes.length,
  })
  // Fall back to the first tab if the active one has disappeared (e.g. Fulfilment
  // after a status change leaves no rows).
  const currentTab = tabs.some((t) => t.id === activeTab) ? activeTab : 'lines'

  return (
    <AppLayout>
      <PageHeader
        title={order.order_number}
        subtitle={order.customer_name ?? undefined}
        actions={
          !justDeleted ? (
            <>
              <DownloadMenu
                label="Download"
                iconOnly
                size="sm"
                options={[
                  { key: 'pdf', label: 'PDF', onSelect: handleDownload },
                  { key: 'word-en', label: 'Word (EN)', onSelect: () => handleDownloadDocx('en') },
                  { key: 'word-ar', label: 'Word (AR)', onSelect: () => handleDownloadDocx('ar') },
                ]}
              />
              <Button
                variant="primary"
                size="sm"
                className="!w-9 !px-0"
                onClick={() => setEmailOpen(true)}
                aria-label="Send email"
              >
                <EmailIcon />
              </Button>
              {allowWrite && (
                <Button
                  variant="primary"
                  size="sm"
                  className="!w-9 !px-0"
                  onClick={() => setPaymentEmailOpen(true)}
                  aria-label="Send payment request"
                >
                  <BanknoteIcon />
                </Button>
              )}
              {allowWrite && order.status === 'ready_to_ship' && (
                <Button
                  variant="primary"
                  size="sm"
                  className="!w-9 !px-0"
                  onClick={() => setSplitOpen(true)}
                  aria-label="Split order"
                >
                  <TornPaperIcon />
                </Button>
              )}
              {allowWrite && (order.status === 'ready_to_ship' || order.status === 'shipped') && (
                <Button
                  variant="primary"
                  size="sm"
                  className="!w-9 !px-0"
                  onClick={handleCreateDeliveryNote}
                  isLoading={busy}
                  aria-label="Create delivery note"
                >
                  <MovingCartIcon />
                </Button>
              )}
              {allowWrite && order.status === 'draft' && (
                <Button
                  variant="primary"
                  size="sm"
                  className="!w-9 !px-0"
                  onClick={() => navigate(`/orders/${orderId}/edit`)}
                  aria-label="Edit"
                >
                  <EditIcon />
                </Button>
              )}
              {allowWrite && order.status === 'draft' && (
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

      {order.next_action && (
        <Alert variant="info">
          <span className="font-medium">Next action:</span> {order.next_action}
        </Alert>
      )}

      {order.status === 'draft' && blockStatus?.blocked && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          <span>
            Awaiting admin approval before this order can be confirmed: {blockStatus.reasons.join('; ')}.
          </span>
          {allowAdmin && !order.approved_at && (
            <Button variant="ghost" size="sm" onClick={handleApprove} isLoading={busy}>Approve</Button>
          )}
        </div>
      )}

      {order.admin_review_required && allowAdmin && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          <span>
            {order.admin_review_reason === 'payment_overdue'
              ? 'This order was confirmed over 7 days ago with no payment recorded — needs admin review.'
              : order.admin_review_reason === 'overdue_delivery'
                ? 'This order is past its confirmed delivery date — needs admin review.'
                : 'This order is flagged for admin review.'}
          </span>
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
          {order.approved_at && (
            <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-200">
              Approved {formatDate(order.approved_at)}
            </span>
          )}
          {order.confirmation_emailed_at && (
            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-white/50">
              Confirmation emailed {formatDate(order.confirmation_emailed_at)}
            </span>
          )}
          {order.payment_requested_at && (
            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-white/50">
              Payment requested {formatDate(order.payment_requested_at)}
            </span>
          )}
          {order.parent_order_id && (
            <Link
              to={`/orders/${order.parent_order_id}`}
              className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-white/50 hover:border-white/20 hover:text-white/70"
            >
              Split from {order.parent_order_number}
            </Link>
          )}
          {allowAdmin && order.status === 'draft' && !order.approved_at && (
            <Button
              variant="primary"
              size="sm"
              className="!w-9 !px-0"
              isLoading={busy}
              onClick={handleApprove}
              aria-label="Approve"
            >
              <ThumbsUpIcon />
            </Button>
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
          <Field label="Customer">
            <Link to={`/customers/${order.customer_id}`} className="text-gold-300 hover:text-gold-200">
              {order.customer_name ?? '—'}
            </Link>
            {order.customer_number && <span className="ml-2 text-xs text-white/40">{order.customer_number}</span>}
          </Field>
          <Field label="Primary contact">
            {order.customer_contact_person || '—'}
            {order.customer_phone && <span className="ml-2 text-xs text-white/40">{order.customer_phone}</span>}
          </Field>
          <Field label="Order date" value={formatDate(order.order_date)} />
          <Field label="Requested delivery" value={formatDate(order.requested_delivery_date)} />
          <Field label="Confirmed delivery">
            {formatDate(order.confirmed_delivery_date)}
            {allowWrite && order.status !== 'draft' && order.status !== 'shipped' && order.status !== 'delivered' && order.status !== 'cancelled' && (
              <button
                type="button"
                onClick={() => setDeliveryDateOpen(true)}
                className="ml-2 text-xs text-gold-300 underline hover:text-gold-200"
              >
                Change
              </button>
            )}
          </Field>
          <Field label="Total" value={formatCurrency(order.total_amount)} />
        </dl>
        {order.discount_percent > 0 && (
          <p className="mt-3 text-xs text-white/40">
            Subtotal {formatCurrency(order.subtotal_amount)}
            {' '}− {order.discount_percent}% discount ({formatCurrency(order.discount_amount)})
            {' '}= {formatCurrency(order.total_amount)}
          </p>
        )}

        {order.notes && (
          <div className="mt-6">
            <Field label="Notes" value={order.notes} />
          </div>
        )}
      </GlassCard>

      <Tabs items={tabs} activeId={currentTab} onChange={setActiveTab} className="mb-6" />

      <TabPanel id="lines" activeId={currentTab}>
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
      </TabPanel>

      {hasFulfillment && (
        <TabPanel id="fulfilment" activeId={currentTab}>
          <GlassCard className="overflow-hidden">
            <div className="border-b border-white/10 px-6 py-4">
              <h2 className="font-display text-lg font-medium text-white">Fulfilment</h2>
              <p className="mt-1 text-xs text-white/40">
                Consumes released Finished Goods stock -- production is not owned by this order.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-xs tracking-wide text-white/40 uppercase">
                    <th className="px-6 py-4 font-medium">Product</th>
                    <th className="px-6 py-4 font-medium">Ordered</th>
                    <th className="px-6 py-4 font-medium">Delivered</th>
                    <th className="px-6 py-4 font-medium">Remaining</th>
                    <th className="px-6 py-4 font-medium">Released FG available</th>
                    <th className="px-6 py-4 font-medium">Fulfillable now</th>
                    <th className="px-6 py-4 font-medium">Shortage</th>
                    <th className="px-6 py-4 font-medium">In pipeline</th>
                  </tr>
                </thead>
                <tbody>
                  {fulfillment.map((line) => (
                    <tr key={line.order_detail_id} className="border-b border-white/5 last:border-0">
                      <td className="px-6 py-4 text-white">
                        {line.product_code ? `${line.product_code} — ${line.product_name}` : `#${line.product_id}`}
                      </td>
                      <td className="px-6 py-4 text-white/60">{line.ordered_quantity} {line.unit}</td>
                      <td className="px-6 py-4 text-white/60">{line.delivered_quantity} {line.unit}</td>
                      <td className="px-6 py-4 text-white/60">{line.remaining_quantity} {line.unit}</td>
                      <td className="px-6 py-4 text-white/60">{line.available_fg} {line.unit}</td>
                      <td className="px-6 py-4 text-white">{line.fulfillable_now} {line.unit}</td>
                      <td className="px-6 py-4">
                        {line.shortage > 0 ? (
                          <Badge tone="gold">{`${line.shortage} ${line.unit ?? ''} short`}</Badge>
                        ) : (
                          <span className="text-white/40">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-white/60">
                        {line.planned_production_quantity > 0 || line.in_progress_production_quantity > 0 ? (
                          <>
                            {line.planned_production_quantity > 0 && `${line.planned_production_quantity} planned`}
                            {line.planned_production_quantity > 0 && line.in_progress_production_quantity > 0 && ', '}
                            {line.in_progress_production_quantity > 0 && `${line.in_progress_production_quantity} in progress`}
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </GlassCard>
        </TabPanel>
      )}

      <TabPanel id="production" activeId={currentTab}>
        <GlassCard className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
            <h2 className="font-display text-lg font-medium text-white">
              Production orders {productionOrders.length > 0 && <span className="text-sm text-white/40">({productionOrders.length})</span>}
            </h2>
            {allowWrite && (order.status === 'confirmed' || order.status === 'in_production') && (
              <Button variant="ghost" size="sm" onClick={() => setProductionOrderModalOpen(true)}>
                + Production order
              </Button>
            )}
          </div>
          {productionOrders.length === 0 ? (
            <p className="px-6 py-6 text-sm text-white/40">
              No production orders yet -- create one to plan manufacturing for this order.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-xs tracking-wide text-white/40 uppercase">
                    <th className="px-6 py-4 font-medium">Production order</th>
                    <th className="px-6 py-4 font-medium">Product</th>
                    <th className="px-6 py-4 font-medium">Planned qty</th>
                    <th className="px-6 py-4 font-medium">Due date</th>
                    <th className="px-6 py-4 font-medium">Priority</th>
                    <th className="px-6 py-4 font-medium">Status</th>
                    <th className="px-6 py-4 font-medium">QC</th>
                  </tr>
                </thead>
                <tbody>
                  {productionOrdersPager.pageItems.map((po) => {
                    const qcRequests = qcByProductionOrder[po.id] ?? []
                    const latestQc = qcRequests[0]
                    return (
                      <tr key={po.id} className="border-b border-white/5 last:border-0">
                        <td className="px-6 py-4">
                          <Link to={`/production-orders/${po.id}`} className="font-medium text-gold-300 hover:text-gold-200">
                            {po.production_order_number}
                          </Link>
                        </td>
                        <td className="px-6 py-4 text-white">
                          {po.product_code ? `${po.product_code} — ${po.product_name}` : `#${po.product_id}`}
                        </td>
                        <td className="px-6 py-4 text-white/60">{po.planned_quantity} {po.unit ?? ''}</td>
                        <td className="px-6 py-4 text-white/60">{formatDate(po.due_date)}</td>
                        <td className="px-6 py-4"><Badge tone="neutral">{po.priority}</Badge></td>
                        <td className="px-6 py-4"><StatusBadge status={po.status} /></td>
                        <td className="px-6 py-4">
                          {latestQc ? (
                            <Link to={`/production-orders/${po.id}`} className="inline-flex items-center gap-2 hover:opacity-80">
                              <StatusBadge status={latestQc.status} />
                              {qcRequests.length > 1 && (
                                <span className="text-xs text-white/40">+{qcRequests.length - 1} more</span>
                              )}
                            </Link>
                          ) : (
                            <span className="text-white/40">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          <Pagination className="px-6 pb-4" {...productionOrdersPager.pagerProps} />
        </GlassCard>
      </TabPanel>

      <TabPanel id="delivery" activeId={currentTab} className="flex flex-col gap-6">
        {deliveryNotes.length > 0 && (
          <GlassCard className="overflow-hidden">
            <div className="border-b border-white/10 px-6 py-4">
              <h2 className="font-display text-lg font-medium text-white">
                Delivery notes {deliveryNotes.length > 1 && <span className="text-sm text-white/40">({deliveryNotes.length})</span>}
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-xs tracking-wide text-white/40 uppercase">
                    <th className="px-6 py-4 font-medium">Note</th>
                    <th className="px-6 py-4 font-medium">Date</th>
                    <th className="px-6 py-4 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {deliveryNotesPager.pageItems.map((n) => (
                    <tr key={n.id} className="border-b border-white/5 last:border-0">
                      <td className="px-6 py-4">
                        <Link to={`/delivery-notes/${n.id}`} className="font-medium text-gold-300 hover:text-gold-200">
                          {n.delivery_note_number}
                        </Link>
                      </td>
                      <td className="px-6 py-4 text-white/60">{formatDate(n.delivery_date)}</td>
                      <td className="px-6 py-4"><StatusBadge status={n.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination className="px-6 pb-4" {...deliveryNotesPager.pagerProps} />
          </GlassCard>
        )}

        {order.child_orders.length > 0 && (
          <GlassCard className="p-6">
            <h2 className="mb-4 font-display text-base font-medium text-white">
              Split into <span className="text-sm text-white/40">({order.child_orders.length})</span>
            </h2>
            <div className="flex flex-col gap-2">
              {childOrdersPager.pageItems.map((child) => (
                <Link
                  key={child.id}
                  to={`/orders/${child.id}`}
                  className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-4 py-3 hover:border-white/20"
                >
                  <span className="font-medium text-white">{child.order_number}</span>
                  <span className="flex items-center gap-3">
                    <span className="text-sm text-white/40">{formatCurrency(child.total_amount)}</span>
                    <StatusBadge status={child.status} />
                  </span>
                </Link>
              ))}
            </div>
            <Pagination className="mt-4" {...childOrdersPager.pagerProps} />
          </GlassCard>
        )}

        {deliveryNotes.length === 0 && order.child_orders.length === 0 && (
          <GlassCard className="p-6">
            <p className="text-sm text-white/40">
              No delivery notes yet -- one can be created once the order is ready to ship.
            </p>
          </GlassCard>
        )}
      </TabPanel>

      <TabPanel id="payments" activeId={currentTab} className="flex flex-col gap-6">
        <PaymentsPanel orderId={orderId} orderTotal={order.total_amount} allowWrite={allowWrite} allowAdmin={allowAdmin} allowFinance={allowFinance} />
        <PaymentPlansPanel orderId={orderId} allowWrite={allowWrite} allowAdmin={allowAdmin} allowFinance={allowFinance} />
      </TabPanel>

      <TabPanel id="journey" activeId={currentTab}>
        <OrderJourney orderId={orderId} />
      </TabPanel>

      <TabPanel id="history" activeId={currentTab}>
        <HistoryTimeline resourcePath="/api/orders" id={orderId} />
      </TabPanel>

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
        onSend={async (toEmail, message, attachPdf) => {
          await emailOrder(order.id, toEmail, message, attachPdf)
          setNotice(`Emailed to ${toEmail}.`)
        }}
      />

      <SendEmailDialog
        open={paymentEmailOpen}
        title={`Send payment request — ${order.order_number}`}
        defaultEmail={order.customer_email}
        onClose={() => setPaymentEmailOpen(false)}
        onSend={async (toEmail, message, attachPdf) => {
          const updated = await requestPayment(order.id, toEmail, message, attachPdf)
          setOrder(updated)
          setNotice(`Payment request sent to ${toEmail}.`)
        }}
      />

      <SplitOrderModal
        open={splitOpen}
        order={order}
        onClose={() => setSplitOpen(false)}
        onSplit={(child) => {
          setSplitOpen(false)
          setNotice(
            `Split into new order ${child.order_number} (${formatCurrency(child.total_amount)}) -- delivered separately.`,
          )
          load()
        }}
      />

      <CreateProductionOrderModal
        open={productionOrderModalOpen}
        order={order}
        onClose={() => setProductionOrderModalOpen(false)}
        onCreated={(po) => {
          setProductionOrderModalOpen(false)
          setNotice(`Production order ${po.production_order_number} created.`)
          loadProductionOrders()
        }}
      />

      <DeliveryDateChangeModal
        open={deliveryDateOpen}
        order={order}
        onClose={() => setDeliveryDateOpen(false)}
        onChanged={(updated) => {
          setOrder(updated)
          setDeliveryDateOpen(false)
          setNotice('Confirmed delivery date changed.')
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
