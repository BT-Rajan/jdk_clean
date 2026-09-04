import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { Alert, Button, ConfirmDialog, Field, GlassCard, PageHeader, Spinner, StatusBadge } from '@/components/ui'
import { SendEmailDialog } from '@/components/documents/SendEmailDialog'
import {
  approveQuotation,
  convertQuotationToOrder,
  deleteQuotation,
  downloadQuotationDocx,
  downloadQuotationPdf,
  emailQuotation,
  getQuotation,
  restoreQuotation,
  updateQuotationStatus,
} from '@/api/quotations'
import type { Quotation } from '@/types/quotation'
import { getApiErrorMessage } from '@/lib/apiError'
import { formatDate } from '@/lib/dateFormat'
import { formatCurrency } from '@/lib/currency'
import { HistoryTimeline } from '@/components/history/HistoryTimeline'
import { useAuth } from '@/hooks/useAuth'
import { useAsyncGuard } from '@/hooks/useAsyncGuard'
import { canWriteDepartment, isAdmin } from '@/lib/roles'
import { QUOTATION_STATUSES_REQUIRING_REASON, QUOTATION_TRANSITIONS } from '@/lib/statusTransitions'
import { StatusTransitionButtons } from '@/components/status/StatusTransitionButtons'

export function QuotationDetailPage() {
  const { id } = useParams()
  const quotationId = Number(id)
  const navigate = useNavigate()
  const { user } = useAuth()
  const allowWrite = canWriteDepartment(user, 'sales')
  const allowAdmin = isAdmin(user?.role)

  const [quotation, setQuotation] = useState<Quotation | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const { busy, run: runGuarded } = useAsyncGuard()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [emailOpen, setEmailOpen] = useState(false)
  const [justDeleted, setJustDeleted] = useState(false)

  function load() {
    setLoading(true)
    getQuotation(quotationId)
      .then(setQuotation)
      .catch((err) => setError(getApiErrorMessage(err)))
      .finally(() => setLoading(false))
  }

  useEffect(load, [quotationId])

  // One request in flight at a time (see useAsyncGuard) -- a fast
  // double-click on "Convert to order" or "Approve" must not fire the
  // request twice.
  function withBusy(fn: () => Promise<void>): Promise<void> {
    setError(null)
    return runGuarded(fn).catch((err) => setError(getApiErrorMessage(err)))
  }

  async function handleStatusChange(status: (typeof QUOTATION_TRANSITIONS)['draft'][number], reason?: string) {
    await withBusy(async () => {
      const updated = await updateQuotationStatus(quotationId, status, reason)
      setQuotation(updated)
      setNotice(`Status changed to ${status}.`)
    })
  }

  async function handleApprove() {
    await withBusy(async () => {
      const updated = await approveQuotation(quotationId)
      setQuotation(updated)
      setNotice('Approved and sent.')
    })
  }

  async function handleConvert() {
    await withBusy(async () => {
      const order = await convertQuotationToOrder(quotationId)
      navigate(`/orders/${order.id}`)
    })
  }

  async function handleDownload() {
    if (!quotation) return
    await withBusy(async () => {
      await downloadQuotationPdf(quotation.id, quotation.quotation_number)
    })
  }

  async function handleDownloadDocx(language: 'en' | 'ar') {
    if (!quotation) return
    await withBusy(async () => {
      await downloadQuotationDocx(quotation.id, quotation.quotation_number, language)
    })
  }

  async function handleDelete() {
    await withBusy(async () => {
      await deleteQuotation(quotationId)
      setConfirmOpen(false)
      setJustDeleted(true)
      setNotice('Quotation deleted.')
    })
  }

  async function handleRestore() {
    await withBusy(async () => {
      const restored = await restoreQuotation(quotationId)
      setQuotation(restored)
      setJustDeleted(false)
      setNotice('Quotation restored.')
    })
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
              <Button variant="ghost" onClick={() => handleDownloadDocx('en')} isLoading={busy}>Word (EN)</Button>
              <Button variant="ghost" onClick={() => handleDownloadDocx('ar')} isLoading={busy}>Word (AR)</Button>
              <Button variant="ghost" onClick={() => setEmailOpen(true)}>Send email</Button>
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
          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-white/50">
            {quotation.language === 'ar' ? 'Arabic' : 'English'}
          </span>
          {quotation.auto_created && (
            <span className="rounded-full border border-gold-400/30 bg-gold-500/10 px-2.5 py-1 text-xs font-medium text-gold-200">
              Auto-created from feasibility
            </span>
          )}
          {quotation.deal_number && (
            <Link
              to={`/deals/${quotation.deal_id}`}
              className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-white/50 hover:border-white/20 hover:text-white/70"
            >
              {quotation.deal_number}
            </Link>
          )}
          {quotation.approved_at && (
            <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-200">
              Approved {formatDate(quotation.approved_at)}
            </span>
          )}
          {allowAdmin && quotation.status === 'draft' && !quotation.approved_at && (
            <Button variant="ghost" size="sm" isLoading={busy} onClick={handleApprove}>
              Approve
            </Button>
          )}
          {quotation.converted_order_id && (
            <Link to={`/orders/${quotation.converted_order_id}`} className="text-sm text-gold-300 hover:text-gold-200">
              View converted order →
            </Link>
          )}
          {allowWrite && nextStatuses.length > 0 && !justDeleted && (
            <div className="ml-auto">
              <StatusTransitionButtons
                nextStatuses={nextStatuses}
                reasonRequiredFor={QUOTATION_STATUSES_REQUIRING_REASON}
                reasonLabel="Reason for rejecting"
                busy={busy}
                onChange={handleStatusChange}
              />
            </div>
          )}
        </div>

        <dl className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          <Field label="Date" value={formatDate(quotation.quotation_date)} />
          <Field label="Valid until" value={formatDate(quotation.valid_until)} />
          <Field label="Total" value={formatCurrency(quotation.total_amount)} />
        </dl>
        {quotation.discount_percent > 0 && (
          <p className="mt-3 text-xs text-white/40">
            Subtotal {formatCurrency(quotation.subtotal_amount)}
            {' '}− {quotation.discount_percent}% discount ({formatCurrency(quotation.discount_amount)})
            {' '}= {formatCurrency(quotation.total_amount)}
          </p>
        )}

        {quotation.notes && (
          <div className="mt-6">
            <Field label="Notes" value={quotation.notes} />
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
                  <td className="px-6 py-4 text-white/60">{formatCurrency(line.unit_price)}</td>
                  <td className="px-6 py-4 text-white/60">{formatCurrency(line.line_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>

      <div className="mt-6">
        <HistoryTimeline resourcePath="/api/quotations" id={quotationId} />
      </div>

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

      <SendEmailDialog
        open={emailOpen}
        title={`Email ${quotation.quotation_number}`}
        defaultEmail={quotation.customer_email}
        onClose={() => setEmailOpen(false)}
        onSend={async (toEmail, message) => {
          await emailQuotation(quotation.id, toEmail, message)
          setNotice(`Emailed to ${toEmail}.`)
        }}
      />
    </AppLayout>
  )
}
