/** Mirrors backend/app/schemas/quotation.py. */

export type QuotationStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired' | 'converted'

export interface QuotationLineInput {
  product_id: number
  quantity: number
  unit_price: number
}

export interface QuotationLine extends QuotationLineInput {
  id: number
  product_code: string | null
  product_name: string | null
  unit: string | null
  line_total: number
}

export interface Quotation {
  id: number
  quotation_number: string
  customer_id: number
  customer_name: string | null
  customer_email: string | null
  quotation_date: string
  valid_until: string | null
  status: QuotationStatus
  total_amount: number
  notes: string | null
  converted_order_id: number | null
  lines: QuotationLine[]
  created_at: string
  updated_at: string
}

export interface QuotationPayload {
  customer_id: number
  quotation_date: string
  valid_until?: string | null
  notes?: string | null
  lines: QuotationLineInput[]
}

/** 'converted' is deliberately excluded -- only create_order_from_quotation sets it. */
export type SettableQuotationStatus = Exclude<QuotationStatus, 'draft' | 'converted'>
