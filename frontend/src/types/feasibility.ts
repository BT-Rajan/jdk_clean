/** Mirrors backend/app/models/feasibility.py */

export type FeasibilityStatus = 'draft' | 'feasible' | 'exception_pending' | 'exception_approved' | 'exception_rejected' | 'closed' | 'converted'

export interface FeasibilityLineInput {
  product_id: number
  quantity: number
}

export interface FeasibilityLine extends FeasibilityLineInput {
  id: number
  product_code: string | null
  product_name: string | null
  is_feasible: boolean | null
  shortfall_json: string | null
}

export interface Feasibility {
  id: number
  feasibility_number: string
  customer_id: number
  customer_name: string | null
  status: FeasibilityStatus
  checked_at: string | null
  exception_reason: string | null
  close_reason: string | null
  notes: string | null
  lines: FeasibilityLine[]
  created_at: string
  updated_at: string
}

export interface FeasibilityPayload {
  customer_id: number
  notes?: string | null
  lines: FeasibilityLineInput[]
}
