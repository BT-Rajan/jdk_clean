/** Mirrors backend/app/schemas/feasibility.py (FeasibilityOut/FeasibilityLineOut). */

export type FeasibilityStatus =
  | 'draft'
  | 'feasible'
  | 'exception_pending'
  | 'exception_approved'
  | 'exception_rejected'
  | 'closed'
  | 'converted'
  | 'expired'

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
  /** Earliest date the machine + labor pool could actually finish this,
   * given what's already booked -- null if not achievable at all within
   * the scan horizon. */
  projected_completion_date: string | null
  shortfall_days: number | null
  workers_required: number | null
  required_worker_hours: number | null
}

export interface FeasibilityLine extends FeasibilityLineInput {
  id: number
  product_code: string | null
  product_name: string | null
  /** How much of `quantity` was already sitting in unreserved
   * finished-goods stock at check time -- netted off before raw-material/
   * capacity requirements were computed for the rest. Null if nothing was
   * covered by existing stock. */
  covered_by_stock: number | null
  /** True when the product has no BOM/formula configured at all --
   * feasibility couldn't be verified for this line, forced infeasible
   * rather than silently passing. */
  bom_missing: boolean | null
  is_feasible: boolean | null
  shortfalls: ShortfallItem[]
  capacity_ok: boolean | null
  capacity_shortfall: CapacityShortfall | null
  /** When the remainder (after stock) can actually be supplied -- today
   * if fully covered by stock, otherwise the capacity scan's projected
   * date starting from the next working day. Null if raw materials are
   * short, or it isn't evaluable. */
  estimated_ready_date: string | null
}

export interface Feasibility {
  id: number
  feasibility_number: string
  customer_id: number
  customer_name: string | null
  deal_id: number | null
  deal_number: string | null
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
