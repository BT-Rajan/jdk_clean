import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { Alert, Button, ConfirmDialog, GlassCard, PageHeader, Spinner, StatusBadge, TextField } from '@/components/ui'
import {
  deletePurchaseOrder,
  getPurchaseOrder,
  receivePurchaseOrder,
  restorePurchaseOrder,
  updatePurchaseOrderStatus,
} from '@/api/purchaseOrders'
import type { PurchaseOrder } from '@/types/purchaseOrder'
import { getApiErrorMessage } from '@/lib/apiError'
import { useAuth } from '@/hooks/useAuth'
import { canWrite } from '@/lib/roles'
import { PURCHASE_ORDER_TRANSITIONS } from '@/lib/statusTransitions'

function Field({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div>
      <dt className="text-xs font-medium tracking-wide text-white/40 uppercase">{label}</dt>
      <dd className="mt-1 text-[15px] text-white">{value ?? '—'}</dd>
    </div>
  )
}

export function PurchaseOrderDetailPage() {
  const { id } = useParams()
  const poId = Number(id)
  const navigate = useNavigate()
  const { user } = useAuth()
  const allowWrite = canWrite(user?.role)

  const [po, setPo] = useState<PurchaseOrder | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [justDeleted, setJustDeleted] = useState(false)
  const [receiveQuantities, setReceiveQuantities] = useState<Record<number, string>>({})

  function load() {
    setLoading(true)
    getPurchaseOrder(poId)
      .then((data) => {
        setPo(data)
        const defaults: Record<number, string> = {}
        for (const line of data.lines) {
          const remaining = line.quantity - line.received_quantity
          defaults[line.id] = remaining > 0 ? String(remaining) : '0'
        }
        setReceiveQuantities(defaults)
      })
      .catch((err) => setError(getApiErrorMessage(err)))
      .finally(() => setLoading(false))
  }

  useEffect(load, [poId])

  async function handleStatusChange(status: 'sent' | 'confirmed' | 'cancelled') {
    setBusy(true)
    setError(null)
    try {
      const updated = await updatePurchaseOrderStatus(poId, status)
      setPo(updated)
      setNotice(`Status changed to ${status}.`)
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
        .map((l) => ({ line_id: l.id, quantity: Number(receiveQuantities[l.id] ?? 0) }))
        .filter((l) => l.quantity > 0)
      if (lines.length === 0) {
        setError('Enter a quantity for at least one line to receive.')
        return
      }
      const updated = await receivePurchaseOrder(poId, lines)
      setPo(updated)
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

  return (
    <AppLayout>
      <PageHeader
        title={po.po_number}
        subtitle={po.supplier_name ?? undefined}
        actions={
          !justDeleted ? (
            <>
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

      <GlassCard className="mb-6 p-8">
        <div className="mb-6 flex flex-wrap items-center gap-4">
          <StatusBadge status={po.status} />
          {!justDeleted && nextStatuses.length > 0 && (
            <div className="ml-auto flex gap-2">
              {nextStatuses.map((s) => (
                <Button key={s} variant="ghost" size="sm" isLoading={busy} onClick={() => handleStatusChange(s)}>
                  Mark {s}
                </Button>
              ))}
            </div>
          )}
        </div>

        <dl className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          <Field label="Order date" value={po.order_date} />
          <Field label="Expected delivery" value={po.expected_delivery_date} />
          <Field label="Total" value={po.total_amount.toLocaleString()} />
        </dl>

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
                    <td className="px-6 py-4 text-white/60">{line.unit_price.toLocaleString()}</td>
                    <td className="px-6 py-4 text-white/60">{line.line_total.toLocaleString()}</td>
                    <td className="px-6 py-4 text-white/60">{line.received_quantity} {line.unit}</td>
                    {canReceive && (
                      <td className="px-6 py-4">
                        {remaining > 0 ? (
                          <div className="w-28">
                            <TextField
                              label=""
                              type="number"
                              step="0.0001"
                              max={remaining}
                              value={receiveQuantities[line.id] ?? ''}
                              onChange={(e) =>
                                setReceiveQuantities((prev) => ({ ...prev, [line.id]: e.target.value }))
                              }
                            />
                          </div>
                        ) : (
                          <span className="text-xs text-white/40">Fully received</span>
                        )}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {canReceive && (
          <div className="flex justify-end border-t border-white/10 px-6 py-4">
            <Button isLoading={busy} onClick={handleReceive}>Receive goods</Button>
          </div>
        )}
      </GlassCard>

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
    </AppLayout>
  )
}
