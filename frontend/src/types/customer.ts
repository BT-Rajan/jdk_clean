/** Mirrors backend/app/schemas/customer.py. */

export type ActiveStatus = 'active' | 'inactive'

/** Mirrors backend/app/models/customer.py CUSTOMER_TYPES. */
export type CustomerType = 'individual' | 'business'

/** Mirrors backend/app/models/customer.py CUSTOMER_ONBOARDING_STATUSES. */
export type CustomerOnboardingStatus = 'pending' | 'under_review' | 'active' | 'on_hold' | 'rejected'

/** Mirrors backend/app/models/customer.py PAYMENT_TERMS_TYPES. */
export type PaymentTermsType = 'cash' | 'advance' | 'credit' | 'custom'

/** Mirrors backend/app/models/customer.py PAYMENT_METHODS. */
export type PaymentMethod = 'cash' | 'credit_card' | 'bank_transfer' | 'cheque' | 'other'

/** Mirrors backend/app/models/customer.py AUTO_POST_BILLS_MODES. */
export type AutoPostBillsMode = 'manual' | 'automatic'

/** Mirrors backend/app/models/customer.py FOLLOW_UP_STAGES. */
export type FollowUpStage = 'none' | '15_days' | '30_days' | '45_days' | 'legal'

/** Mirrors backend/app/models/customer.py FOLLOW_UP_STATUSES. */
export type FollowUpStatus = 'up_to_date' | 'in_progress' | 'overdue' | 'escalated'

/** Mirrors backend/app/models/customer.py REMINDER_MODES. */
export type ReminderMode = 'automatic' | 'manual'

/** Mirrors backend/app/schemas/customer.py CustomerBankAccount. */
export interface CustomerBankAccount {
  bank_name: string
  account_number: string
  iban?: string | null
  swift_code?: string | null
}

export interface Customer {
  id: number
  /** Internal reference, auto-generated -- distinct from `code`, the
   * externally-issued Civil ID / Registration number. */
  customer_number: string
  customer_type: CustomerType
  /** Civil ID / Registration number -- null for a prospective customer
   * (raised for a feasibility check or quotation) who hasn't provided
   * it yet; can be completed later but is locked once set. */
  code: string | null
  name: string
  /** Optional display/trading name, shown instead of `name` where set. */
  trade_name: string | null
  contact_person: string | null
  email: string | null
  phone: string | null
  /** Backup contact only -- not deduplicated the way phone/email are. */
  alternate_phone: string | null
  alternate_email: string | null
  billing_address: string | null
  shipping_address: string | null
  city: string | null
  country: string | null
  /** Free-text operational classification for filtering/reporting only. */
  category: string | null
  /** Who currently owns the operational relationship with this customer
   * -- set via POST /{id}/assign (Sales Head/admin only), not a plain
   * field edit. Was already on backend CustomerOut but unused by the
   * frontend until the Salesperson widget on CustomerDetailPage. */
  assigned_to: number | null
  credit_limit: number
  payment_terms_days: number
  payment_terms_type: PaymentTermsType
  /** Overrides Settings' global large-discount approval threshold for
   * this customer only -- null means "use the global setting". */
  discount_approval_threshold_override: number | null
  status: ActiveStatus
  onboarding_status: CustomerOnboardingStatus
  onboarding_reason: string | null
  notes: string | null
  id_document_filename: string | null
  id_verified: boolean
  id_verified_at: string | null
  id_verified_by: number | null
  created_at: string
  updated_at: string

  // -- Customer Master fields (see backend/app/models/customer.py) --
  avatar_filename: string | null
  parent_company_id: number | null
  /** Read-only -- resolved server-side from parent_company_id. */
  parent_company_name: string | null
  job_position: string | null
  website: string | null
  tags: string[] | null
  address_line1: string | null
  address_line2: string | null
  state: string | null
  payment_method: PaymentMethod | null
  pricelist: string | null
  group_rfq: boolean
  buyer_id: number | null
  purchase_payment_terms_days: number | null
  purchase_payment_terms_type: PaymentTermsType | null
  purchase_payment_method: PaymentMethod | null
  receipt_reminder: boolean
  supplier_currency: string | null
  fiscal_position: string | null
  reference: string | null
  bank_accounts: CustomerBankAccount[] | null
  account_receivable: string | null
  account_payable: string | null
  auto_post_bills: AutoPostBillsMode | null
  follow_up_stage: FollowUpStage | null
  follow_up_status: FollowUpStatus | null
  reminder_mode: ReminderMode | null
  next_reminder_date: string | null
  followup_responsible_id: number | null
}

export interface CustomerPayload {
  customer_type: CustomerType
  /** Omit to create a prospective customer with no ID on file yet. */
  code?: string | null
  name: string
  trade_name?: string | null
  contact_person?: string | null
  email?: string | null
  phone?: string | null
  alternate_phone?: string | null
  alternate_email?: string | null
  billing_address?: string | null
  shipping_address?: string | null
  city?: string | null
  country?: string | null
  category?: string | null
  credit_limit?: number
  payment_terms_days?: number
  payment_terms_type?: PaymentTermsType
  discount_approval_threshold_override?: number | null
  status?: ActiveStatus
  notes?: string | null

  // -- Customer Master fields (see backend/app/models/customer.py) --
  parent_company_id?: number | null
  job_position?: string | null
  website?: string | null
  tags?: string[] | null
  address_line1?: string | null
  address_line2?: string | null
  state?: string | null
  payment_method?: PaymentMethod | null
  pricelist?: string | null
  group_rfq?: boolean
  buyer_id?: number | null
  purchase_payment_terms_days?: number | null
  purchase_payment_terms_type?: PaymentTermsType | null
  purchase_payment_method?: PaymentMethod | null
  receipt_reminder?: boolean
  supplier_currency?: string | null
  fiscal_position?: string | null
  reference?: string | null
  bank_accounts?: CustomerBankAccount[] | null
  account_receivable?: string | null
  account_payable?: string | null
  auto_post_bills?: AutoPostBillsMode | null
  follow_up_stage?: FollowUpStage | null
  follow_up_status?: FollowUpStatus | null
  reminder_mode?: ReminderMode | null
  next_reminder_date?: string | null
  followup_responsible_id?: number | null
}
