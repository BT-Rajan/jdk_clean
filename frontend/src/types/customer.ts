/** Mirrors backend/app/schemas/customer.py. */

export type ActiveStatus = 'active' | 'inactive'

/** Mirrors backend/app/models/customer.py CUSTOMER_TYPES. */
export type CustomerType = 'individual' | 'business'

/** Mirrors backend/app/models/customer.py CUSTOMER_ONBOARDING_STATUSES. */
export type CustomerOnboardingStatus = 'pending' | 'under_review' | 'active' | 'on_hold' | 'rejected'

/** Mirrors backend/app/models/customer.py PAYMENT_TERMS_TYPES. */
export type PaymentTermsType = 'cash' | 'advance' | 'credit' | 'custom'

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
}
