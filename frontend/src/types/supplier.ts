/** Mirrors backend/app/schemas/supplier.py. */
import type { ActiveStatus } from './customer'

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
  status: ActiveStatus
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
  status?: ActiveStatus
}
