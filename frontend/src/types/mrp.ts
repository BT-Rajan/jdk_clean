/** Mirrors backend/app/schemas/mrp.py. */

export interface MrpSuggestedPurchase {
  supplier_id: number
  supplier_code: string
  supplier_name: string
  quantity: number
  lead_time_days: number | null
  mode_of_supply: string | null
}

export interface MrpIncomingPurchaseOrder {
  purchase_order_id: number
  po_number: string
  supplier_name: string | null
  quantity: number
  expected_delivery_date: string | null
  status: string
}

export type MrpSourceType = 'production_order' | 'legacy_batch' | 'order'

export interface MrpSource {
  source_type: MrpSourceType
  schedule_id: number | null
  batch_number: string | null
  production_order_id: number | null
  production_order_number: string | null
  order_id: number | null
  order_number: string | null
  product_id: number
  product_name: string | null
  required_quantity: number
  required_by_date: string | null
  /** True when this source's own required_by_date falls before the
   * material's expected_available_date (or that date can't be
   * projected at all) -- this shortage risks making it miss its date. */
  at_risk: boolean
}

export interface MrpRequirementLine {
  raw_material_id: number
  code: string
  name: string
  unit: string
  reorder_point: number
  total_required: number
  /** On-hand stock net of existing reservations/allocations -- not raw
   * on-hand. */
  available_quantity: number
  confirmed_incoming_quantity: number
  incoming_purchase_orders: MrpIncomingPurchaseOrder[]
  /** required - available - confirmed incoming, clamped at 0. */
  shortfall: number
  uncovered_quantity: number
  fully_covered: boolean
  /** shortfall is 0 purely because confirmed incoming stock already
   * closes the gap -- nothing new to suggest for this material. */
  fully_covered_by_incoming: boolean
  date_known: boolean
  expected_available_date: string | null
  suggested_purchases: MrpSuggestedPurchase[]
  sources: MrpSource[]
}

export interface MrpSourceGroupMaterial {
  raw_material_id: number
  code: string
  name: string
  unit: string
  required_quantity: number
  shortfall: number
  fully_covered: boolean
}

export interface MrpSourceGroup {
  source_type: MrpSourceType
  id: number | null
  label: string | null
  product_id: number
  product_name: string | null
  required_by_date: string | null
  at_risk: boolean
  materials: MrpSourceGroupMaterial[]
}

export interface MrpReport {
  generated_at: string
  items: MrpRequirementLine[]
  by_source: MrpSourceGroup[]
}

export interface MrpCreatePoPayload {
  raw_material_id: number
  supplier_id: number
  quantity: number
}
