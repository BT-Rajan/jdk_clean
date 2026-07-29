import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { Alert, Button, ConfirmDialog, GlassCard, PageHeader, Spinner, StatusBadge } from '@/components/ui'
import {
  convertQuotationToOrder,
  deleteQuotation,
  downloadQuotationPdf,
  getQuotation,
  restoreQuotation,
  updateQuotationStatus,
} from '@/api/quotations'
import type { Quotation } from '@/types/quotation'
import { getApiErrorMessage } from '@/lib/apiError'
import { useAuth } from '@/hooks/useAuth'
import { canWriteDepartment } from '@/lib/roles'
import { QUOTATION_TRANSITIONS } from '@/lib/statusTransitions'

export function QuotationDetailPage() {
  const { id } = useParams()
  const quotationId = Number(id)
  const navigate = useNavigate()
  const { user } = useAuth()
  const allowWrite = canWriteDepartment(user, 'sales')

  const [quotation, setQuotation] = useState<Quotation | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [justDeleted, setJustDeleted] = useState(false)

  function load() {
    setLoading(true)
    getQuotation(quotationId)
      .then(setQuotation)
      .catch((err) => setError(getApiErrorMessage(err)))
      .finally(() => setLoading(false))
  }

  useEffect(load, [quotationId])

  async function handleStatusChange(status: (typeof QUOTATION_TRANSITIONS)['draft'][number]) {
    setBusy(true)
    setError(null)
    try {
      const updated = await updateQuotationStatus(quotationId, status)
      setQuotation(updated)
      setNotice(`Status changed to ${status}.`)
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleConvert() {
    setBusy(true)
    setError(null)
    try {
      const order = await convertQuotationToOrder(quotationId)
      navigate(`/orders/${order.id}`)
    } catch (err) {
      setError(getApiErrorMessage(err))
      setBusy(false)
    }
  }

  async function handleDownload() {
    if (!quotation) return
    setBusy(true)
    try {
      await downloadQuotationPdf(quotation.id, quotation.quotation_number)
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    setBusy(true)
    try {
      await deleteQuotation(quotationId)
      setConfirmOpen(false)
      setJustDeleted(true)
      setNotice('Quotation deleted.')
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleRestore() {
    setBusy(true)
    try {
      const restored = await restoreQuotation(quotationId)
      setQuotation(restored)
      setJustDeleted(false)
      setNotice('Quotation restored.')
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

  if (!quotation) {
    return (
      <AppLayout>
        <Alert variant="error">{error ?? 'Quotation not found.'}</Alert>
      </AppLayout>
    )
  }

  const nextStatuses = QUOTATION_TRANSITIONS[quotation.status]
  const canDelete = quotation.status !== 'converted'

  return (
    <AppLayout>
      <PageHeader
        title={quotation.quotation_number}
        subtitle={quotation.customer_name ?? undefined}
        actions={
          !justDeleted ? (
            <>
              <Button variant="ghost" onClick={handleDownload} isLoading={busy}>Download PDF</Button>
              {allowWrite && quotation.status === 'draft' && (
                <Button variant="ghost" onClick={() => navigate(`/quotations/${quotationId}/edit`)}>Edit</Button>
              )}
              {allowWrite && quotation.status === 'accepted' && (
                <Button onClick={handleConvert} isLoading={busy}>Convert to order</Button>
              )}
              {allowWrite && canDelete && (
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
          <StatusBadge status={quotation.status} />
          {quotation.converted_order_id && (
            <Link to={`/orders/${quotation.converted_order_id}`} className="text-sm text-gold-300 hover:text-gold-200">
              View converted order →
            </Link>
          )}
          {allowWrite && nextStatuses.length > 0 && !justDeleted && (
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
          <div>
            <dt className="text-xs font-medium tracking-wide text-white/40 uppercase">Date</dt>
            <dd className="mt-1 text-[15px] text-white">{quotation.quotation_date}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium tracking-wide text-white/40 uppercase">Valid until</dt>
            <dd className="mt-1 text-[15px] text-white">{quotation.valid_until ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium tracking-wide text-white/40 uppercase">Total</dt>
            <dd className="mt-1 text-[15px] text-white">{quotation.total_amount.toLocaleString()}</dd>
          </div>
        </dl>

        {quotation.notes && (
          <div className="mt-6">
            <dt className="text-xs font-medium tracking-wide text-white/40 uppercase">Notes</dt>
            <dd className="mt-1 text-[15px] text-white/80">{quotation.notes}</dd>
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
              {quotation.lines.map((line) => (
                <tr key={line.id} className="border-b border-white/5 last:border-0">
                  <td className="px-6 py-4 text-white">
                    {line.product_code ? `${line.product_code} — ${line.product_name}` : `#${line.product_id}`}
                  </td>
                  <td className="px-6 py-4 text-white/60">{line.quantity} {line.unit}</td>
                  <td className="px-6 py-4 text-white/60">{line.unit_price.toLocaleString()}</td>
                  <td className="px-6 py-4 text-white/60">{line.line_total.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>

      <div className="mt-6">
        <Link to="/quotations" className="text-sm text-white/50 hover:text-white">← Back to quotations</Link>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Delete quotation"
        message={`Delete ${quotation.quotation_number}? This can be undone immediately after, but not once you leave this page.`}
        confirmLabel="Delete"
        danger
        busy={busy}
        onConfirm={handleDelete}
        onCancel={() => setConfirmOpen(false)}
      />
    </AppLayout>
  )
}
