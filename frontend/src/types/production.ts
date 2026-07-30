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
  created_at: string
  updated_at: string
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
