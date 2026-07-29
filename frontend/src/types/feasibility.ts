/** Mirrors backend/app/schemas/feasibility.py (FeasibilityOut/FeasibilityLineOut). */

export type FeasibilityStatus =
  | 'draft'
  | 'feasible'
  | 'exception_pending'
  | 'exception_approved'
  | 'exception_rejected'
  | 'closed'
  | 'converted'

export type AdminReviewReason = 'override' | 'stale_open'

export interface FeasibilityLineInput {
  product_id: number
  quantity: number
}

export interface ShortfallItem {
  raw_material_id: number
  code: string
  name: string
  unit: string
  required: number
  on_hand: number
  shortfall: number
}

export interface CapacityShortfall {
  machine: string
  required_hours: number
  available_hours: number
  shortfall_hours: number
}

export interface FeasibilityLine extends FeasibilityLineInput {
  id: number
  product_code: string | null
  product_name: string | null
  is_feasible: boolean | null
  shortfalls: ShortfallItem[]
  capacity_ok: boolean | null
  capacity_shortfall: CapacityShortfall | null
}

export interface Feasibility {
  id: number
  feasibility_number: string
  customer_id: number
  customer_name: string | null
  status: FeasibilityStatus
  required_by_date: string | null
  checked_at: string | null
  exception_reason: string | null
  close_reason: string | null
  notes: string | null
  admin_review_required: boolean
  admin_review_reason: AdminReviewReason | null
  admin_reviewed_at: string | null
  admin_review_notes: string | null
  lines: FeasibilityLine[]
  created_at: string
  updated_at: string
}

export interface FeasibilityPayload {
  customer_id: number
  required_by_date?: string | null
  notes?: string | null
  lines: FeasibilityLineInput[]
}
