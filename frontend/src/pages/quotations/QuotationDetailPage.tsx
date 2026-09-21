import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { Alert, Button, ConfirmDialog, DeleteIcon, DownloadMenu, EditIcon, EmailIcon, Field, GlassCard, PageHeader, Spinner, StatusBadge, TextField, ThumbsUpIcon } from '@/components/ui'
import { SendEmailDialog } from '@/components/documents/SendEmailDialog'
import {
  approveQuotation,
  convertQuotationToOrder,
  deleteQuotation,
  downloadQuotationDocx,
  downloadQuotationPdf,
  emailQuotation,
  getQuotation,
  getQuotationEmailPreview,
  recordQuotationFollowup,
  renewQuotation,
  restoreQuotation,
  setQuotationPaymentLink,
  updateQuotationStatus,
} from '@/api/quotations'
import type { Quotation } from '@/types/quotation'
import { getApiErrorMessage } from '@/lib/apiError'
import { formatDate, formatDateTime } from '@/lib/dateFormat'
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
  const [emailPreview, setEmailPreview] = useState<{ to_email: string | null; subject: string; body: string } | null>(null)
  const [emailPreviewLoading, setEmailPreviewLoading] = useState(false)
  const [paymentLinkInput, setPaymentLinkInput] = useState('')

  async function handleOpenEmail() {
    setEmailPreviewLoading(true)
    try {
      setEmailPreview(await getQuotationEmailPreview(quotationId))
    } catch {
      // Fall back to a blank compose box rather than blocking "Send
      // email" entirely over a preview-only request failing.
      setEmailPreview(null)
    } finally {
      setEmailPreviewLoading(false)
      setEmailOpen(true)
    }
  }
  const [justDeleted, setJustDeleted] = useState(false)

  function load() {
    setLoading(true)
    getQuotation(quotationId)
      .then(setQuotation)
      .catch((err) => setError(getApiErrorMessage(err)))
      .finally(() => setLoading(false))
  }

  useEffect(load, [quotationId])

  useEffect(() => {
    setPaymentLinkInput(quotation?.payment_link ?? '')
  }, [quotation?.payment_link])

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
      setNotice('Approved.')
    })
  }

  async function handleConvert() {
    await withBusy(async () => {
      const order = await convertQuotationToOrder(quotationId)
      navigate(`/orders/${order.id}`)
    })
  }

  async function handleRenew() {
    await withBusy(async () => {
      const updated = await renewQuotation(quotationId)
      setQuotation(updated)
      setNotice(`Renewed -- valid until ${formatDate(updated.valid_until)}.`)
    })
  }

  async function handleFollowup() {
    await withBusy(async () => {
      const updated = await recordQuotationFollowup(quotationId)
      setQuotation(updated)
      setNotice(`Follow-up recorded. Next one due ${formatDate(updated.next_followup_date)}.`)
    })
  }

  async function handleSavePaymentLink() {
    await withBusy(async () => {
      const updated = await setQuotationPaymentLink(quotationId, paymentLinkInput.trim())
      setQuotation(updated)
      setNotice('Payment link saved.')
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
                onClick={handleOpenEmail}
                isLoading={emailPreviewLoading}
                disabled={quotation.status === 'expired'}
                title={quotation.status === 'expired' ? 'This quotation has expired -- renew it before sending.' : undefined}
                aria-label="Send email"
              >
                <EmailIcon />
              </Button>
              {allowWrite && quotation.status === 'expired' && (
                <Button size="sm" onClick={handleRenew} isLoading={busy}>Renew</Button>
              )}
              {allowWrite && quotation.status === 'draft' && (
                <Button
                  variant="primary"
                  size="sm"
                  className="!w-9 !px-0"
                  onClick={() => navigate(`/quotations/${quotationId}/edit`)}
                  aria-label="Edit"
                >
                  <EditIcon />
                </Button>
              )}
              {allowWrite && quotation.conversion_status === 'ready' && (
                <Button onClick={handleConvert} isLoading={busy}>Convert to order</Button>
              )}
              {allowWrite && canDelete && (
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

      {quotation.feasibility_blocker && (
        <div className="mb-6 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          {quotation.feasibility_blocker}
        </div>
      )}

      <GlassCard className="mb-6 p-8">
        <div className="mb-6 flex flex-wrap items-center gap-4">
          <StatusBadge status={quotation.status} />
          {quotation.status !== 'converted' && (
            <span title={quotation.conversion_block_reasons.join(' ') || undefined}>
              <StatusBadge status={quotation.conversion_status} />
            </span>
          )}
          {quotation.followup_status !== 'completed' && <StatusBadge status={quotation.followup_status} />}
          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-white/50">
            {quotation.language === 'ar' ? 'Arabic' : 'English'}
          </span>
          {quotation.auto_created && (
            <span className="rounded-full border border-gold-400/30 bg-gold-500/10 px-2.5 py-1 text-xs font-medium text-gold-200">
              Auto-created from feasibility
            </span>
          )}
          {quotation.material_conflict_acknowledged && (
            <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-200">
              Material conflict acknowledged
            </span>
          )}
          {quotation.feasibility_id && (
            <Link to={`/feasibilities/${quotation.feasibility_id}`} className="text-sm text-gold-300 hover:text-gold-200">
              View feasibility check →
            </Link>
          )}
          {quotation.approved_at && (
            <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-200">
              Approved {formatDate(quotation.approved_at)}
            </span>
          )}
          {allowAdmin && quotation.status === 'draft' && !quotation.approved_at && (
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
          <Field label="Customer">
            <Link to={`/customers/${quotation.customer_id}`} className="text-gold-300 hover:text-gold-200">
              {quotation.customer_name ?? `#${quotation.customer_id}`}
            </Link>
          </Field>
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

        {quotation.conversion_status === 'blocked' && quotation.status === 'accepted' && (
          <div className="mt-6 rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-200">
            <p className="font-medium">Cannot convert to an order yet:</p>
            <ul className="mt-1 list-inside list-disc">
              {quotation.conversion_block_reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/5 p-4">
          <div>
            <p className="text-sm font-medium text-white">Follow-up</p>
            <p className="mt-1 text-xs text-white/40">
              Last followed up {quotation.last_followup_at ? formatDateTime(quotation.last_followup_at) : 'never'}
              {' · '}Next due {formatDate(quotation.next_followup_date)}
            </p>
          </div>
          {allowWrite && quotation.followup_status !== 'completed' && (
            <Button size="sm" onClick={handleFollowup} isLoading={busy}>Follow up now</Button>
          )}
        </div>

        {quotation.status === 'accepted' && (
          <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="mb-1 text-sm font-medium text-white">Payment link</p>
            <p className="mb-3 text-xs text-white/40">
              Paste the payment link generated in the external payment system. Required before this
              quotation can be converted to an order -- it's printed as a QR code on the order's invoice.
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[280px] flex-1">
                <TextField
                  label="Payment link"
                  value={paymentLinkInput}
                  onChange={(e) => setPaymentLinkInput(e.target.value)}
                  placeholder="https://payments.example.com/…"
                  disabled={!allowWrite}
                />
              </div>
              {allowWrite && (
                <Button
                  size="sm"
                  onClick={handleSavePaymentLink}
                  isLoading={busy}
                  disabled={!paymentLinkInput.trim() || paymentLinkInput.trim() === quotation.payment_link}
                >
                  {quotation.payment_link ? 'Update' : 'Save'}
                </Button>
              )}
            </div>
          </div>
        )}

        {quotation.notes && (
          <div className="mt-6">
            <Field label="Notes" value={quotation.notes} />
          </div>
        )}

        {quotation.material_conflict_acknowledged && quotation.material_conflict_details && (
          <div className="mt-6 rounded-xl border border-amber-400/30 bg-amber-500/10 p-4">
            <p className="mb-2 text-sm font-medium text-amber-200">
              Material conflict acknowledged at creation
            </p>
            <ul className="flex flex-col gap-1 text-xs text-amber-100/90">
              {quotation.material_conflict_details.map((c) => (
                <li key={c.raw_material_id}>
                  {c.name}: short {c.shortfall} {c.unit} (also needed by{' '}
                  {c.competing_quotations.map((cq) => cq.quotation_number).join(', ')})
                </li>
              ))}
            </ul>
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
        defaultEmail={emailPreview?.to_email ?? quotation.customer_email}
        defaultMessage={emailPreview?.body}
        subjectPreview={emailPreview?.subject}
        onClose={() => setEmailOpen(false)}
        onSend={async (toEmail, message, attachPdf) => {
          await emailQuotation(quotation.id, toEmail, message, attachPdf)
          setNotice(`Emailed to ${toEmail}.`)
        }}
      />
    </AppLayout>
  )
}
