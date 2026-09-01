import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { Alert, Button, ConfirmDialog, Field, GlassCard, PageHeader, Spinner } from '@/components/ui'
import { HistoryTimeline } from '@/components/history/HistoryTimeline'
import { deleteSupplierReturn, getSupplierReturn } from '@/api/supplierReturns'
import type { SupplierReturn } from '@/types/supplierReturn'
import { getApiErrorMessage } from '@/lib/apiError'
import { formatDate, formatDateTime } from '@/lib/dateFormat'
import { useAuth } from '@/hooks/useAuth'
import { isAdmin } from '@/lib/roles'

export function SupplierReturnDetailPage() {
  const { id } = useParams()
  const returnId = Number(id)
  const navigate = useNavigate()
  const { user } = useAuth()
  const allowAdmin = isAdmin(user?.role)

  const [supplierReturn, setSupplierReturn] = useState<SupplierReturn | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    getSupplierReturn(returnId)
      .then(setSupplierReturn)
      .catch((err) => setError(getApiErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [returnId])

  async function handleReverse() {
    setBusy(true)
    try {
      await deleteSupplierReturn(returnId)
      navigate('/supplier-returns')
    } catch (err) {
      setError(getApiErrorMessage(err))
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

  if (!supplierReturn) {
    return (
      <AppLayout>
        <Alert variant="error">{error ?? 'Supplier return not found.'}</Alert>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <PageHeader
        title={supplierReturn.return_number}
        subtitle={supplierReturn.supplier_name ?? `Supplier #${supplierReturn.supplier_id}`}
        actions={
          allowAdmin ? (
            <Button variant="danger" onClick={() => setConfirmOpen(true)}>
              Reverse
            </Button>
          ) : undefined
        }
      />

      <Alert variant="error">{error}</Alert>

      <GlassCard className="p-8">
        <dl className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <Field label="Return date" value={formatDate(supplierReturn.return_date)} />
          <Field
            label="Purchase order"
            value={
              supplierReturn.purchase_order_id ? (
                <Link to={`/purchase-orders/${supplierReturn.purchase_order_id}`} className="text-gold-300 hover:text-gold-200">
                  {supplierReturn.po_number}
                </Link>
              ) : (
                'Not linked to a specific PO'
              )
            }
          />
          <Field label="Recorded by" value={supplierReturn.created_by_name} />
          <Field label="Recorded" value={formatDateTime(supplierReturn.created_at)} />
        </dl>
        <div className="mt-6 border-t border-white/10 pt-6">
          <p className="text-xs uppercase tracking-wide text-white/40">Reason</p>
          <p className="mt-2 text-white">{supplierReturn.reason}</p>
        </div>
        {supplierReturn.notes && (
          <div className="mt-6">
            <p className="text-xs uppercase tracking-wide text-white/40">Notes</p>
            <p className="mt-2 text-white/70">{supplierReturn.notes}</p>
          </div>
        )}
      </GlassCard>

      <GlassCard className="mt-6 p-6">
        <h2 className="mb-4 font-display text-base font-medium text-white">Line items</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-xs tracking-wide text-white/40 uppercase">
                <th className="px-4 py-3 font-medium">Raw material</th>
                <th className="px-4 py-3 font-medium">Quantity returned</th>
              </tr>
            </thead>
            <tbody>
              {supplierReturn.lines.map((line) => (
                <tr key={line.id} className="border-b border-white/5 last:border-0">
                  <td className="px-4 py-3 text-white">
                    {line.material_code} — {line.material_name}
                  </td>
                  <td className="px-4 py-3 text-white/60">
                    {line.quantity} {line.unit}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>

      <div className="mt-6">
        <HistoryTimeline resourcePath="/api/supplier-returns" id={returnId} />
      </div>

      <div className="mt-6">
        <Link to="/supplier-returns" className="text-sm text-white/50 hover:text-white">
          ← Back to supplier returns
        </Link>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Reverse supplier return"
        message={`Reverse ${supplierReturn.return_number}? This puts every returned quantity back onto raw-material stock on hand, as though this return was never recorded -- use this only to correct a data-entry mistake, not because the supplier later accepted the goods (record a fresh receipt for that instead).`}
        confirmLabel="Reverse"
        danger
        busy={busy}
        onConfirm={handleReverse}
        onCancel={() => setConfirmOpen(false)}
      />
    </AppLayout>
  )
}
