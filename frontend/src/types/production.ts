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
  /** "Can this batch start right now" -- only set while status is
   * 'planned' (null once started/completed/cancelled, see
   * production_readiness_service.quick_status). Populated by the list/get
   * endpoints, not the full breakdown -- see ReadinessResult for that. */
  readiness_status: ReadinessStatus | null
  created_at: string
  updated_at: string
}

/** Mirrors backend/app/schemas/production_readiness.py. */
export type ReadinessStatus =
  | 'READY'
  | 'MATERIAL_SHORTAGE'
  | 'MACHINE_CONFLICT'
  | 'WORKER_SHORTAGE'
  | 'MULTIPLE_ISSUES'
  | 'NO_ACTIVE_BOM'

export interface ReadinessAlternative {
  raw_material_id: number
  code: string
  name: string
  unit: string
  conversion_ratio: number
  priority: number
  status: string
  on_hand: number
  available: number
}

export interface ReadinessProcurement {
  supplier_id: number
  supplier_code: string
  supplier_name: string
  is_preferred: boolean
  purchase_price: number
  currency: string
  moq: number
  lead_time_days: number | null
}

export interface ReadinessMaterial {
  raw_material_id: number
  code: string
  name: string
  unit: string
  required: number
  on_hand: number
  reserved: number
  available: number
  shortage: number
  safety_stock: number
  safety_stock_warning: boolean
  alternatives: ReadinessAlternative[]
  procurement: ReadinessProcurement | null
}

export interface ReadinessMachine {
  machine_id: number
  machine_code: string
  machine_name: string
  required_hours: number
  available_hours: number
  ok: boolean
}

export interface ReadinessWorkers {
  workers_required: number
  required_hours: number
  available_hours: number
  ok: boolean
}

export interface ReadinessResult {
  status: ReadinessStatus
  product_id: number
  quantity: number
  bom_id: number | null
  bom_number: string | null
  output_quantity: number | null
  materials: ReadinessMaterial[]
  machine: ReadinessMachine | null
  workers: ReadinessWorkers | null
  summary: string
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
  /** Set when an authorized user explicitly chose an approved alternative
   * (see ReadinessAlternative) instead of the BOM's own material for this
   * line -- raw_material_id is then the alternative actually consumed,
   * and this is the BOM's original material it stood in for. The BOM
   * itself is never changed by this. */
  substituted_for_raw_material_id?: number | null
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
