/** Mirrors backend/app/schemas/quotation.py. */

export type QuotationStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired' | 'converted'
export type QuotationLanguage = 'en' | 'ar'

export interface QuotationLineInput {
  product_id: number
  quantity: number
  unit_price: number
  discount_percent?: number
}

export interface QuotationLine extends QuotationLineInput {
  id: number
  product_code: string | null
  product_name: string | null
  unit: string | null
  discount_percent: number
  line_total: number
}

export interface Quotation {
  id: number
  quotation_number: string
  customer_id: number
  customer_name: string | null
  customer_email: string | null
  deal_id: number | null
  deal_number: string | null
  feasibility_id: number | null
  /** True when the system drafted this automatically because a
   * feasibility check just passed, rather than a person creating it. */
  auto_created: boolean
  quotation_date: string
  valid_until: string | null
  status: QuotationStatus
  /** Which admin-uploaded template (Admin -> Documents) this was raised
   * in -- what Print/Email default to rendering. */
  language: QuotationLanguage
  subtotal_amount: number
  discount_percent: number
  discount_amount: number
  total_amount: number
  notes: string | null
  converted_order_id: number | null
  /** Set once an admin has approved a large discount on this quotation
   * (Settings -> large_discount_approval_threshold). Null if never
   * required or not yet approved. */
  approved_at: string | null
  lines: QuotationLine[]
  created_at: string
  updated_at: string
}

export interface QuotationPayload {
  customer_id: number
  feasibility_id?: number | null
  quotation_date: string
  valid_until?: string | null
  notes?: string | null
  /** Percentage, e.g. 0 or 10 -- a whole-document discount on top of
   * any per-line discounts. */
  discount_percent?: number
  lines: QuotationLineInput[]
  language: QuotationLanguage
}

/** 'converted' is deliberately excluded -- only create_order_from_quotation sets it. */
export type SettableQuotationStatus = Exclude<QuotationStatus, 'draft' | 'converted'>
