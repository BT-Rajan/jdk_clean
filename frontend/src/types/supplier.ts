/** Mirrors backend/app/schemas/supplier.py. */

export type SupplierStatus = 'active' | 'inactive' | 'suspended'
export type ModeOfSupply = 'direct' | 'distributor' | 'broker' | 'import'

export interface Supplier {
  id: number
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
}

export interface SupplierPayload {
  code: string
  name: string
  contact_person?: string | null
  email?: string | null
  phone?: string | null
  address?: string | null
  city?: string | null
  country?: string | null
  tax_id?: string | null
  payment_terms_days?: number
  mode_of_supply?: ModeOfSupply | null
  rating?: number | null
  status?: SupplierStatus
}
