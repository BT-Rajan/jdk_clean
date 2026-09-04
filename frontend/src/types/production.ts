/** Mirrors backend/app/schemas/production_schedule.py. */

export type ProductionStatus = 'planned' | 'in_progress' | 'completed' | 'cancelled'

export interface ProductionBatch {
  id: number
  batch_number: string
  product_id: number
  product_code: string | null
  product_name: string | null
  unit: string | null
  order_id: number | null
  order_number: string | null
  planned_quantity: number
  produced_quantity: number
  scheduled_start: string
  scheduled_end: string
  actual_start: string | null
  actual_end: string | null
  status: ProductionStatus
  /** True when the system created this batch automatically on order
   * confirmation, rather than a person scheduling it by hand. */
  auto_scheduled: boolean
  notes: string | null
  /** True when completing this batch found actual raw-material usage
   * either over a material's BOM-configured scrap allowance or below
   * the bare zero-scrap requirement for the reported output. */
  material_discrepancy_flag: boolean
  material_discrepancy_findings: MaterialDiscrepancyFinding[] | null
  created_at: string
  updated_at: string
}

export interface MaterialDiscrepancyFinding {
  raw_material_id: number
  material: string
  unit: string
  type: 'discrepancy' | 'scrap_allowance_breach'
  actual_used: number
  minimum_required?: number
  allowed_up_to?: number
  actual_scrap_percent?: number | null
  allowed_scrap_percent?: number
  message: string
}

export interface MaterialRequirement {
  raw_material_id: number
  code: string
  name: string
  unit: string
  net_required: number
  planned_required: number
  current_on_hand: number
}

export interface ActualMaterialUsed {
  raw_material_id: number
  quantity_used: number
}

export interface ProductionBatchPayload {
  product_id: number
  order_id?: number | null
  planned_quantity: number
  scheduled_start: string
  scheduled_end: string
  notes?: string | null
}

/** 'planned' is the only status a batch starts in and is never set directly
 * via the status endpoint (it's the creation default), matching
 * SettableOrderStatus's same exclusion pattern. */
export type SettableProductionStatus = Exclude<ProductionStatus, 'planned'>
