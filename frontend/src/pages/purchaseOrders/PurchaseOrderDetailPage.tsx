import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { Alert, Button, ConfirmDialog, Field, GlassCard, Modal, PageHeader, Spinner, StatusBadge, TextField, TextareaField } from '@/components/ui'
import { SendEmailDialog } from '@/components/documents/SendEmailDialog'
import {
  adminReviewPurchaseOrder,
  approvePurchaseOrder,
  deletePurchaseOrder,
  downloadPurchaseOrderPdf,
  emailPurchaseOrder,
  getPurchaseOrder,
  receivePurchaseOrder,
  restorePurchaseOrder,
  updatePurchaseOrderStatus,
} from '@/api/purchaseOrders'
import type { PurchaseOrder } from '@/types/purchaseOrder'
import { getApiErrorMessage } from '@/lib/apiError'
import { formatDate } from '@/lib/dateFormat'
import { formatCurrency } from '@/lib/currency'
import { clampNonNegativeString } from '@/lib/number'
import { HistoryTimeline } from '@/components/history/HistoryTimeline'
import { useAuth } from '@/hooks/useAuth'
import { canWriteDepartment, isAdmin } from '@/lib/roles'
import { PURCHASE_ORDER_STATUSES_REQUIRING_REASON, PURCHASE_ORDER_TRANSITIONS } from '@/lib/statusTransitions'
import { StatusTransitionButtons } from '@/components/status/StatusTransitionButtons'
import { purchaseOrderAdminReviewSchema, type PurchaseOrderAdminReviewFormValues } from '@/lib/validation'

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
  } = useForm<PurchaseOrderAdminReviewFormValues>({ resolver: zodResolver(purchaseOrderAdminReviewSchema) })

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

export function PurchaseOrderDetailPage() {
  const { id } = useParams()
  const poId = Number(id)
  const navigate = useNavigate()
  const { user } = useAuth()
  const allowWrite = canWriteDepartment(user, 'procurement')
  const allowAdmin = isAdmin(user?.role)

  const [po, setPo] = useState<PurchaseOrder | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [emailOpen, setEmailOpen] = useState(false)
  const [adminReviewOpen, setAdminReviewOpen] = useState(false)
  const [justDeleted, setJustDeleted] = useState(false)
  const [receiveQuantities, setReceiveQuantities] = useState<Record<number, string>>({})
  const [receiveLineDetails, setReceiveLineDetails] = useState<
    Record<number, { unit_cost: string; batch_number: string; expiry_date: string }>
  >({})
  const [receiptMeta, setReceiptMeta] = useState({ invoice_number: '', received_by: '', received_date: '' })

  function defaultReceiveQuantities(data: PurchaseOrder): Record<number, string> {
    const defaults: Record<number, string> = {}
    for (const line of data.lines) {
      const remaining = line.quantity - line.received_quantity
      defaults[line.id] = remaining > 0 ? String(remaining) : '0'
    }
    return defaults
  }

  function updateLineDetail(lineId: number, field: 'unit_cost' | 'batch_number' | 'expiry_date', value: string) {
    setReceiveLineDetails((prev) => {
      const current = prev[lineId] ?? { unit_cost: '', batch_number: '', expiry_date: '' }
      return { ...prev, [lineId]: { ...current, [field]: value } }
    })
  }

  function load() {
    setLoading(true)
    getPurchaseOrder(poId)
      .then((data) => {
        setPo(data)
        setReceiveQuantities(defaultReceiveQuantities(data))
      })
      .catch((err) => setError(getApiErrorMessage(err)))
      .finally(() => setLoading(false))
  }

  useEffect(load, [poId])

  async function handleStatusChange(status: 'sent' | 'confirmed' | 'cancelled', reason?: string) {
    setBusy(true)
    setError(null)
    try {
      const updated = await updatePurchaseOrderStatus(poId, status, reason)
      setPo(updated)
      setNotice(`Status changed to ${status}.`)
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
      const updated = await approvePurchaseOrder(poId)
      setPo(updated)
      setNotice('Approved.')
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleReceive() {
    if (!po) return
    setBusy(true)
    setError(null)
    try {
      const lines = po.lines
        .map((l) => {
          const detail = receiveLineDetails[l.id]
          return {
            line_id: l.id,
            quantity: Number(receiveQuantities[l.id] ?? 0),
            unit_cost: detail?.unit_cost ? Number(detail.unit_cost) : null,
            batch_number: detail?.batch_number || null,
            expiry_date: detail?.expiry_date || null,
          }
        })
        .filter((l) => l.quantity > 0)
      if (lines.length === 0) {
        setError('Enter a quantity for at least one line to receive.')
        return
      }
      if (!receiptMeta.invoice_number || !receiptMeta.received_by || !receiptMeta.received_date) {
        setError('Invoice/delivery note number, received by, and date received are all required.')
        return
      }
      const updated = await receivePurchaseOrder(poId, lines, receiptMeta)
      setPo(updated)
      // Re-derive from the just-returned PO, not the stale pre-receive
      // quantities still sitting in the inputs -- otherwise a line that
      // was just fully received would still show its old (now invalid)
      // amount, and a second click on "Receive goods" would resubmit it,
      // double-counting stock for the same delivery.
      setReceiveQuantities(defaultReceiveQuantities(updated))
      setReceiveLineDetails({})
      setReceiptMeta({ invoice_number: '', received_by: '', received_date: '' })
      setNotice('Goods received and added to raw material stock.')
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    setBusy(true)
    try {
      await deletePurchaseOrder(poId)
      setConfirmOpen(false)
      setJustDeleted(true)
      setNotice('Purchase order deleted.')
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleRestore() {
    setBusy(true)
    try {
      const restored = await restorePurchaseOrder(poId)
      setPo(restored)
      setJustDeleted(false)
      setNotice('Purchase order restored.')
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleDownload() {
    if (!po) return
    setBusy(true)
    try {
      await downloadPurchaseOrderPdf(po.id, po.po_number)
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

  if (!po) {
    return (
      <AppLayout>
        <Alert variant="error">{error ?? 'Purchase order not found.'}</Alert>
      </AppLayout>
    )
  }

  const nextStatuses = PURCHASE_ORDER_TRANSITIONS[po.status]
  const canReceive = allowWrite && !justDeleted && (po.status === 'confirmed' || po.status === 'partially_received')
  const hasPendingReceipt =
    po.lines.some((l) => Number(receiveQuantities[l.id] ?? 0) > 0) &&
    !!receiptMeta.invoice_number &&
    !!receiptMeta.received_by &&
    !!receiptMeta.received_date

  return (
    <AppLayout>
      <PageHeader
        title={po.po_number}
        subtitle={po.supplier_name ?? undefined}
        actions={
          !justDeleted ? (
            <>
              <Button variant="ghost" onClick={handleDownload} isLoading={busy}>Download PDF</Button>
              <Button variant="ghost" onClick={() => setEmailOpen(true)}>Send email</Button>
              {allowWrite && po.status === 'draft' && (
                <Button variant="ghost" onClick={() => navigate(`/purchase-orders/${poId}/edit`)}>Edit</Button>
              )}
              {allowWrite && po.status === 'draft' && (
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

      {po.admin_review_required && allowAdmin && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          <span>This purchase order is flagged for admin review.</span>
          <Button variant="ghost" size="sm" onClick={() => setAdminReviewOpen(true)}>Acknowledge</Button>
        </div>
      )}

      <GlassCard className="mb-6 p-8">
        <div className="mb-6 flex flex-wrap items-center gap-4">
          <StatusBadge status={po.status} />
          {po.auto_created && (
            <span className="rounded-full border border-gold-400/30 bg-gold-500/10 px-2.5 py-1 text-xs font-medium text-gold-200">
              Auto-drafted from MRP shortage
            </span>
          )}
          {po.approved_at && (
            <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-200">
              Approved {formatDate(po.approved_at)}
            </span>
          )}
          {allowAdmin && po.status === 'draft' && !po.approved_at && (
            <Button variant="ghost" size="sm" isLoading={busy} onClick={handleApprove}>
              Approve
            </Button>
          )}
          {allowWrite && !justDeleted && nextStatuses.length > 0 && (
            <div className="ml-auto">
              <StatusTransitionButtons
                nextStatuses={nextStatuses}
                reasonRequiredFor={PURCHASE_ORDER_STATUSES_REQUIRING_REASON}
                reasonLabel="Reason for cancelling"
                busy={busy}
                onChange={handleStatusChange}
              />
            </div>
          )}
        </div>

        <dl className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          <Field label="Order date" value={formatDate(po.order_date)} />
          <Field label="Expected delivery" value={formatDate(po.expected_delivery_date)} />
          <Field label="Total" value={formatCurrency(po.total_amount)} />
        </dl>
        {po.discount_percent > 0 && (
          <p className="mt-3 text-xs text-white/40">
            Subtotal {formatCurrency(po.subtotal_amount)}
            {' '}− {po.discount_percent}% discount ({formatCurrency(po.discount_amount)})
            {' '}= {formatCurrency(po.total_amount)}
          </p>
        )}

        {po.notes && (
          <div className="mt-6">
            <dt className="text-xs font-medium tracking-wide text-white/40 uppercase">Notes</dt>
            <dd className="mt-1 text-[15px] text-white/80">{po.notes}</dd>
          </div>
        )}
      </GlassCard>

      <GlassCard className="mb-6 overflow-hidden">
        <div className="border-b border-white/10 px-6 py-4">
          <h2 className="font-display text-lg font-medium text-white">Line items</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-xs tracking-wide text-white/40 uppercase">
                <th className="px-6 py-4 font-medium">Material</th>
                <th className="px-6 py-4 font-medium">Ordered</th>
                <th className="px-6 py-4 font-medium">Unit price</th>
                <th className="px-6 py-4 font-medium">Line total</th>
                <th className="px-6 py-4 font-medium">Received</th>
                {canReceive && <th className="px-6 py-4 font-medium">Receive now</th>}
                {canReceive && <th className="px-6 py-4 font-medium">Actual unit cost</th>}
                {canReceive && <th className="px-6 py-4 font-medium">Batch/Lot</th>}
                {canReceive && <th className="px-6 py-4 font-medium">Expiry</th>}
              </tr>
            </thead>
            <tbody>
              {po.lines.map((line) => {
                const remaining = line.quantity - line.received_quantity
                return (
                  <tr key={line.id} className="border-b border-white/5 last:border-0">
                    <td className="px-6 py-4 text-white">
                      {line.material_code} — {line.material_name}
                    </td>
                    <td className="px-6 py-4 text-white/60">{line.quantity} {line.unit}</td>
                    <td className="px-6 py-4 text-white/60">{formatCurrency(line.unit_price)}</td>
                    <td className="px-6 py-4 text-white/60">{formatCurrency(line.line_total)}</td>
                    <td className="px-6 py-4 text-white/60">{line.received_quantity} {line.unit}</td>
                    {canReceive && (
                      <td className="px-6 py-4">
                        {remaining > 0 ? (
                          <div className="w-28">
                            <TextField
                              label=""
                              type="number"
                              step="0.0001"
                              min="0"
                              max={remaining}
                              value={receiveQuantities[line.id] ?? ''}
                              onChange={(e) =>
                                setReceiveQuantities((prev) => ({
                                  ...prev,
                                  [line.id]: clampNonNegativeString(e.target.value),
                                }))
                              }
                            />
                          </div>
                        ) : (
                          <span className="text-xs text-white/40">Fully received</span>
                        )}
                      </td>
                    )}
                    {canReceive && (
                      <td className="px-6 py-4">
                        <div className="w-28">
                          <TextField
                            label=""
                            type="number"
                            step="0.0001"
                            min="0"
                            placeholder={String(line.unit_price)}
                            value={receiveLineDetails[line.id]?.unit_cost ?? ''}
                            onChange={(e) => updateLineDetail(line.id, 'unit_cost', clampNonNegativeString(e.target.value))}
                          />
                        </div>
                      </td>
                    )}
                    {canReceive && (
                      <td className="px-6 py-4">
                        <div className="w-28">
                          <TextField
                            label=""
                            value={receiveLineDetails[line.id]?.batch_number ?? ''}
                            onChange={(e) => updateLineDetail(line.id, 'batch_number', e.target.value)}
                          />
                        </div>
                      </td>
                    )}
                    {canReceive && (
                      <td className="px-6 py-4">
                        <div className="w-36">
                          <TextField
                            label=""
                            type="date"
                            value={receiveLineDetails[line.id]?.expiry_date ?? ''}
                            onChange={(e) => updateLineDetail(line.id, 'expiry_date', e.target.value)}
                          />
                        </div>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {canReceive && (
          <div className="border-t border-white/10 px-6 py-4">
            <p className="mb-3 text-xs font-medium tracking-wide text-white/40 uppercase">
              This delivery — applies to every line received above
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <TextField
                label="Invoice / delivery note number"
                value={receiptMeta.invoice_number}
                onChange={(e) => setReceiptMeta((prev) => ({ ...prev, invoice_number: e.target.value }))}
              />
              <TextField
                label="Received by"
                value={receiptMeta.received_by}
                onChange={(e) => setReceiptMeta((prev) => ({ ...prev, received_by: e.target.value }))}
              />
              <TextField
                label="Date received"
                type="date"
                value={receiptMeta.received_date}
                onChange={(e) => setReceiptMeta((prev) => ({ ...prev, received_date: e.target.value }))}
              />
            </div>
            <div className="mt-4 flex justify-end">
              <Button isLoading={busy} disabled={!hasPendingReceipt} onClick={handleReceive}>Receive goods</Button>
            </div>
          </div>
        )}
      </GlassCard>

      <div className="mt-6">
        <HistoryTimeline resourcePath="/api/purchase-orders" id={poId} />
      </div>

      <div className="mt-6">
        <Link to="/purchase-orders" className="text-sm text-white/50 hover:text-white">← Back to purchase orders</Link>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Delete purchase order"
        message={`Delete ${po.po_number}? This can be undone immediately after, but not once you leave this page.`}
        confirmLabel="Delete"
        danger
        busy={busy}
        onConfirm={handleDelete}
        onCancel={() => setConfirmOpen(false)}
      />

      <SendEmailDialog
        open={emailOpen}
        title={`Email ${po.po_number}`}
        defaultEmail={po.supplier_email}
        onClose={() => setEmailOpen(false)}
        onSend={async (toEmail, message) => {
          await emailPurchaseOrder(po.id, toEmail, message)
          setNotice(`Emailed to ${toEmail}.`)
        }}
      />

      <AdminReviewModal
        open={adminReviewOpen}
        onClose={() => setAdminReviewOpen(false)}
        onSubmit={async (notes) => {
          setBusy(true)
          try {
            const updated = await adminReviewPurchaseOrder(poId, notes)
            setPo(updated)
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
