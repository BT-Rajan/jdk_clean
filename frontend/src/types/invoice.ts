/** Mirrors backend/app/schemas/invoice.py. */

export type InvoiceStatus =
  | 'draft'
  | 'waiting_finance'
  | 'link_generated'
  | 'qr_ready'
  | 'awaiting_payment'
  | 'partially_paid'
  | 'paid'
  | 'voided'

/**
 * What everyone with "orders" read access sees -- a scoped salesman, the
 * Sales Manager, or anyone else who can see the underlying order. Never
 * the payment link, QR, or MyFatoorah reference -- those are Finance's
 * (see InvoiceFull below), not Sales' to even read.
 */
export interface Invoice {
  id: number
  invoice_number: string
  order_id: number
  order_number: string | null
  quotation_id: number | null
  quotation_number: string | null
  customer_id: number
  customer_name: string | null
  status: InvoiceStatus
  total_amount: number
  amount_acknowledged: number
  voided_reason: string | null
  created_at: string
  updated_at: string
}

/** Finance's full view (permissions.payments === 'write') -- adds the
 * payment link, QR, and MyFatoorah reference InvoiceStatusOut withholds. */
export interface InvoiceFull extends Invoice {
  version: number
  payment_link_url: string | null
  payment_link_ref: string | null
  payment_link_expires_at: string | null
  qr_data_url: string | null
  voided_at: string | null
  voided_by: number | null
}

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: 'Draft',
  waiting_finance: 'Waiting for Finance',
  link_generated: 'Link generated',
  qr_ready: 'QR ready',
  awaiting_payment: 'Awaiting payment',
  partially_paid: 'Partially paid',
  paid: 'Payment received',
  voided: 'Voided',
}
