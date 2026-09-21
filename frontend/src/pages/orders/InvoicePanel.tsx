import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert, Button, GlassCard, Spinner, StatusBadge } from '@/components/ui'
import { generateInvoicePaymentLink, getInvoiceByOrder } from '@/api/invoices'
import type { Invoice, InvoiceFull } from '@/types/invoice'
import { getApiErrorMessage } from '@/lib/apiError'
import { formatCurrency } from '@/lib/currency'
import { useAsyncGuard } from '@/hooks/useAsyncGuard'

const LINK_GENERATABLE_STATUSES = new Set([
  'waiting_finance',
  'link_generated',
  'qr_ready',
  'awaiting_payment',
  'partially_paid',
])

/**
 * The Sales -> Finance handoff, surfaced right on the order: a salesman
 * sees "Invoice -> Waiting for Finance" (or whichever status) the moment
 * they confirm an order, rather than wondering what happened after
 * approval -- see the "Sales -> Finance Invoice Handoff" design doc's
 * gap 2. Finance's own generate/regenerate action lives here too, gated
 * on the same "payments" write permission payments.py's finance_guard
 * already uses.
 */
export function InvoicePanel({ orderId, allowFinance }: { orderId: number; allowFinance: boolean }) {
  const [invoice, setInvoice] = useState<Invoice | InvoiceFull | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { busy, run: runGuarded } = useAsyncGuard()

  function load() {
    setLoading(true)
    getInvoiceByOrder(orderId)
      .then(setInvoice)
      .catch((err) => setError(getApiErrorMessage(err)))
      .finally(() => setLoading(false))
  }

  useEffect(load, [orderId])

  function handleGenerateLink() {
    if (!invoice) return
    setError(null)
    runGuarded(async () => {
      setInvoice(await generateInvoicePaymentLink(invoice.id))
    }).catch((err) => setError(getApiErrorMessage(err)))
  }

  if (loading) {
    return (
      <GlassCard className="flex justify-center p-6">
        <Spinner size={20} className="text-gold-300" />
      </GlassCard>
    )
  }

  // No invoice yet -- the order hasn't been confirmed (see
  // invoice_service.create_draft_invoice_for_order, fired on confirm).
  if (!invoice) return null

  const isFinanceView = 'payment_link_url' in invoice
  const hasLink = isFinanceView && Boolean((invoice as InvoiceFull).payment_link_url)

  return (
    <GlassCard className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-white/50">Invoice</p>
          <div className="mt-1 flex items-center gap-3">
            <Link
              to={`/invoices/${invoice.id}`}
              className="font-display text-lg font-medium text-gold-300 hover:text-gold-200"
            >
              {invoice.invoice_number}
            </Link>
            <StatusBadge status={invoice.status} />
          </div>
          <p className="mt-1 text-xs text-white/40">
            {formatCurrency(invoice.amount_acknowledged)} of {formatCurrency(invoice.total_amount)} acknowledged
          </p>
        </div>
        <div className="flex items-center gap-3">
          {allowFinance && isFinanceView && LINK_GENERATABLE_STATUSES.has(invoice.status) && (
            <Button size="sm" onClick={handleGenerateLink} isLoading={busy}>
              {hasLink ? 'Regenerate link' : 'Generate payment link'}
            </Button>
          )}
          <Link to={`/invoices/${invoice.id}`}>
            <Button size="sm" variant="ghost">View invoice</Button>
          </Link>
        </div>
      </div>
      {error && (
        <div className="mt-4">
          <Alert variant="error">{error}</Alert>
        </div>
      )}
    </GlassCard>
  )
}
