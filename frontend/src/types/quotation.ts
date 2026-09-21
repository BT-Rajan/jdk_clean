/** Mirrors backend/app/schemas/quotation.py. */

export type QuotationStatus = 'draft' | 'accepted' | 'rejected' | 'expired' | 'converted'
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
  /** A still-relevant concern from the feasibility check this was raised
   * from (approved despite a shortfall, or the check has since been
   * revived and no longer reflects the approval this relied on). Null
   * for a standalone quotation or one whose check is a clean pass. */
  feasibility_blocker: string | null
  /** Set once an admin has approved a large discount on this quotation
   * (Settings -> large_discount_approval_threshold). Null if never
   * required or not yet approved. */
  approved_at: string | null
  /** True when this quotation's material needs overlapped another
   * still-open quotation/order and Sales explicitly proceeded anyway --
   * see check_material_conflicts. */
  material_conflict_acknowledged: boolean
  material_conflict_details: MaterialConflict[] | null
  lines: QuotationLine[]
  /** Stamped every time Sales logs a customer follow-up (a call, an
   * email outside this app) -- distinct from being emailed through
   * this app. See next_followup_date/followup_status. */
  last_followup_at: string | null
  next_followup_date: string | null
  followup_status: FollowupStatus
  /** Where this quotation stands re: becoming an order, and (for
   * 'blocked') exactly why -- see conversion_block_reasons. */
  conversion_status: ConversionStatus
  conversion_block_reasons: string[]
  created_at: string
  updated_at: string
}

export type FollowupStatus = 'not_due' | 'due' | 'overdue' | 'completed'
export type ConversionStatus = 'converted' | 'ready' | 'blocked'

export interface MaterialConflictCompetitor {
  quotation_id: number
  quotation_number: string
}

export interface MaterialConflict {
  raw_material_id: number
  code: string
  name: string
  unit: string
  required_by_this: number
  available: number
  shortfall: number
  competing_quotations: MaterialConflictCompetitor[]
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
  material_conflict_acknowledged?: boolean
}

/** The only status changes a person can make. 'converted' is set by
 * create_order_from_quotation and 'expired' by the scheduled scan. */
export type SettableQuotationStatus = 'accepted' | 'rejected'
