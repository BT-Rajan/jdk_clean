/** Mirrors backend/app/schemas/mrp.py. Read-only -- no create/update shapes. */

export interface MrpSuggestedPurchase {
  supplier_id: number
  supplier_code: string
  supplier_name: string
  quantity: number
  lead_time_days: number | null
  mode_of_supply: string | null
}

export interface MrpRequirementLine {
  raw_material_id: number
  code: string
  name: string
  unit: string
  reorder_point: number
  total_required: number
  current_on_hand: number
  shortfall: number
  uncovered_quantity: number
  fully_covered: boolean
  suggested_purchases: MrpSuggestedPurchase[]
}

export interface MrpReport {
  generated_at: string
  items: MrpRequirementLine[]
}
