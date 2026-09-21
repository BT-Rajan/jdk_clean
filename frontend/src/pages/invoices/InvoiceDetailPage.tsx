import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import {
  Alert,
  Button,
  Field,
  GlassCard,
  Modal,
  PageHeader,
  Spinner,
  StatusBadge,
  TextareaField,
} from '@/components/ui'
import { downloadInvoicePdf, generateInvoicePaymentLink, getInvoice, voidInvoice } from '@/api/invoices'
import type { Invoice, InvoiceFull } from '@/types/invoice'
import { getApiErrorMessage } from '@/lib/apiError'
import { formatCurrency } from '@/lib/currency'
import { formatDateTime } from '@/lib/dateFormat'
import { HistoryTimeline } from '@/components/history/HistoryTimeline'
import { useAuth } from '@/hooks/useAuth'
import { useAsyncGuard } from '@/hooks/useAsyncGuard'
import { canWritePage } from '@/lib/roles'

const LINK_GENERATABLE_STATUSES = new Set([
  'waiting_finance',
  'link_generated',
  'qr_ready',
  'awaiting_payment',
  'partially_paid',
])
const VOIDABLE_STATUSES = new Set(['draft', 'waiting_finance', 'link_generated', 'qr_ready', 'awaiting_payment', 'partially_paid'])

export function InvoiceDetailPage() {
  const { id } = useParams()
  const invoiceId = Number(id)
  const { permissions } = useAuth()
  const allowFinance = canWritePage(permissions, 'payments')

  const [invoice, setInvoice] = useState<Invoice | InvoiceFull | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const { busy, run: runGuarded } = useAsyncGuard()
  const [voidOpen, setVoidOpen] = useState(false)
  const [voidReason, setVoidReason] = useState('')

  function load() {
    setLoading(true)
    getInvoice(invoiceId)
      .then(setInvoice)
      .catch((err) => setError(getApiErrorMessage(err)))
      .finally(() => setLoading(false))
  }

  useEffect(load, [invoiceId])

  function withBusy(fn: () => Promise<void>): Promise<void> {
    setError(null)
    return runGuarded(fn).catch((err) => setError(getApiErrorMessage(err)))
  }

  function handleGenerateLink() {
    withBusy(async () => {
      const updated = await generateInvoicePaymentLink(invoiceId)
      setInvoice(updated)
      setNotice('Payment link generated.')
    })
  }

  function handleVoid() {
    withBusy(async () => {
      const updated = await voidInvoice(invoiceId, voidReason.trim())
      setInvoice(updated)
      setVoidOpen(false)
      setVoidReason('')
      setNotice('Invoice voided.')
    })
  }

  function handleDownload() {
    if (!invoice) return
    withBusy(async () => {
      await downloadInvoicePdf(invoice.id, invoice.invoice_number)
    })
  }

  if (loading) {
    return (
      <AppLayout>
        <div className="flex justify-center py-16">
          <Spinner size={24} className="text-gold-300" />
        </div>
      </AppLayout>
    )
  }

  if (!invoice) {
    return (
      <AppLayout>
        <Alert variant="error">{error ?? 'Invoice not found.'}</Alert>
      </AppLayout>
    )
  }

  const isFinanceView = 'payment_link_url' in invoice
  const full = isFinanceView ? (invoice as InvoiceFull) : null

  return (
    <AppLayout>
      <PageHeader
        title={invoice.invoice_number}
        subtitle={`Order ${invoice.order_number ?? invoice.order_id}`}
        actions={
          <>
            <Button variant="ghost" onClick={handleDownload} isLoading={busy}>Download PDF</Button>
            {allowFinance && full && VOIDABLE_STATUSES.has(invoice.status) && (
              <Button variant="ghost" onClick={() => setVoidOpen(true)}>Void</Button>
            )}
            {allowFinance && full && LINK_GENERATABLE_STATUSES.has(invoice.status) && (
              <Button onClick={handleGenerateLink} isLoading={busy}>
                {full.payment_link_url ? 'Regenerate link' : 'Generate payment link'}
              </Button>
            )}
          </>
        }
      />

      <Alert variant="error">{error}</Alert>
      <Alert variant="success">{notice}</Alert>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <GlassCard className="p-6 lg:col-span-2">
          <div className="mb-4 flex items-center gap-3">
            <StatusBadge status={invoice.status} />
            {invoice.voided_reason && <span className="text-xs text-white/40">{invoice.voided_reason}</span>}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Total" value={formatCurrency(invoice.total_amount)} />
            <Field label="Acknowledged" value={formatCurrency(invoice.amount_acknowledged)} />
            <Field label="Order" value={<Link to={`/orders/${invoice.order_id}`} className="text-gold-300 hover:text-gold-200">{invoice.order_number ?? invoice.order_id}</Link>} />
            {invoice.quotation_id && (
              <Field label="Quotation" value={<Link to={`/quotations/${invoice.quotation_id}`} className="text-gold-300 hover:text-gold-200">{invoice.quotation_number ?? invoice.quotation_id}</Link>} />
            )}
            <Field label="Customer" value={<Link to={`/customers/${invoice.customer_id}`} className="text-gold-300 hover:text-gold-200">{invoice.customer_name ?? invoice.customer_id}</Link>} />
            <Field label="Created" value={formatDateTime(invoice.created_at)} />
          </div>
        </GlassCard>

        {full && (
          <GlassCard className="p-6">
            <p className="mb-3 text-xs uppercase tracking-wide text-white/50">Payment link (Finance only)</p>
            {full.payment_link_url ? (
              <>
                <p className="mb-3 break-all text-sm text-gold-300">{full.payment_link_url}</p>
                {full.qr_data_url && (
                  <img src={full.qr_data_url} alt="Payment QR code" className="h-32 w-32 rounded-lg bg-white p-2" />
                )}
                <p className="mt-3 text-xs text-white/40">
                  Version {full.version}
                  {full.payment_link_expires_at && <> · expires {formatDateTime(full.payment_link_expires_at)}</>}
                </p>
              </>
            ) : (
              <p className="text-sm text-white/40">No payment link generated yet.</p>
            )}
          </GlassCard>
        )}
      </div>

      <div className="mt-6">
        <HistoryTimeline resourcePath="/api/invoices" id={invoiceId} />
      </div>

      <Modal open={voidOpen} title="Void invoice" onClose={() => setVoidOpen(false)}>
        <div className="flex flex-col gap-4">
          <p className="text-sm text-white/60">
            This invoice's payment request will no longer look active. This cannot be undone.
          </p>
          <TextareaField label="Reason" value={voidReason} onChange={(e) => setVoidReason(e.target.value)} />
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setVoidOpen(false)}>Cancel</Button>
            <Button onClick={handleVoid} isLoading={busy} disabled={!voidReason.trim()}>Void invoice</Button>
          </div>
        </div>
      </Modal>
    </AppLayout>
  )
}
