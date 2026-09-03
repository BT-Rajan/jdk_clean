/** Mirrors backend/app/schemas/customer.py. */

export type ActiveStatus = 'active' | 'inactive'

/** Mirrors backend/app/models/customer.py CUSTOMER_ONBOARDING_STATUSES. */
export type CustomerOnboardingStatus = 'pending' | 'under_review' | 'active' | 'on_hold' | 'rejected'

export interface Customer {
  id: number
  code: string
  name: string
  contact_person: string | null
  email: string | null
  phone: string | null
  city: string | null
  country: string | null
  credit_limit: number
  payment_terms_days: number
  status: ActiveStatus
  onboarding_status: CustomerOnboardingStatus
  onboarding_reason: string | null
}

export interface CustomerPayload {
  code: string
  name: string
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
