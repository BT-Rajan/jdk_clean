/** Mirrors backend/app/schemas/supplier.py. */

export type SupplierStatus = 'active' | 'inactive' | 'suspended'
export type ModeOfSupply = 'direct' | 'distributor' | 'broker' | 'import'

/** Mirrors backend/app/models/supplier.py SUPPLIER_ONBOARDING_STATUSES. */
export type SupplierOnboardingStatus = 'pending' | 'under_review' | 'active' | 'on_hold' | 'rejected'

export interface Supplier {
  id: number
  /** Auto-generated -- no longer part of the create payload below. */
  code: string
  name: string
  contact_person: string | null
  email: string | null
  phone: string | null
  city: string | null
  country: string | null
  payment_terms_days: number
  mode_of_supply: ModeOfSupply | null
  rating: number | null
  status: SupplierStatus
  onboarding_status: SupplierOnboardingStatus
  onboarding_reason: string | null
  id_document_filename: string | null
  id_verified: boolean
  id_verified_at: string | null
  id_verified_by: number | null
}

/** code is deliberately absent -- SupplierCRUD.create generates it
 * server-side (see backend/app/schemas/supplier.py SupplierCreate). */
export interface SupplierPayload {
  name: string
  contact_person?: string | null
  email?: string | null
  phone?: string | null
  address?: string | null
  city?: string | null
  country?: string | null
  payment_terms_days?: number
  mode_of_supply?: ModeOfSupply | null
  rating?: number | null
  status?: SupplierStatus
}
