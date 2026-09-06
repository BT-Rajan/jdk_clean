/** Mirrors backend/app/schemas/customer.py. */

export type ActiveStatus = 'active' | 'inactive'

/** Mirrors backend/app/models/customer.py CUSTOMER_TYPES. */
export type CustomerType = 'individual' | 'business'

/** Mirrors backend/app/models/customer.py CUSTOMER_ONBOARDING_STATUSES. */
export type CustomerOnboardingStatus = 'pending' | 'under_review' | 'active' | 'on_hold' | 'rejected'

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
  nature_of_business: string | null
  contact_person: string | null
  email: string | null
  phone: string | null
  billing_address: string | null
  shipping_address: string | null
  city: string | null
  country: string | null
  credit_limit: number
  payment_terms_days: number
  status: ActiveStatus
  onboarding_status: CustomerOnboardingStatus
  onboarding_reason: string | null
  notes: string | null
  id_document_filename: string | null
  id_verified: boolean
  id_verified_at: string | null
  id_verified_by: number | null
}

export interface CustomerPayload {
  customer_type: CustomerType
  /** Omit to create a prospective customer with no ID on file yet. */
  code?: string | null
  name: string
  nature_of_business?: string | null
  contact_person?: string | null
  email?: string | null
  phone?: string | null
  billing_address?: string | null
  shipping_address?: string | null
  city?: string | null
  country?: string | null
  credit_limit?: number
  payment_terms_days?: number
  status?: ActiveStatus
  notes?: string | null
}
