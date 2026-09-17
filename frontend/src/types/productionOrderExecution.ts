/** Mirrors backend/app/schemas/production_execution.py. */

export type ProductionExecutionStatus = 'in_progress' | 'completed' | 'cancelled'

/** 'not_started' | 'in_progress' | 'partially_completed' | 'completed' --
 * derived from the execution runs, never the Production Order's own
 * PLANNED/CANCELLED status (P2) or the Schedule's status (P5). */
export type ProductionExecutionOverallStatus = 'not_started' | 'in_progress' | 'partially_completed' | 'completed'

export interface ProductionExecutionRun {
  id: number
  production_order_id: number
  schedule_id: number
  batch_number: string | null
  product_id: number
  product_code: string | null
  product_name: string | null
  unit: string | null
  machine_id: number | null
  machine_name: string | null
  planned_quantity: number
  produced_quantity: number
  /** How much of produced_quantity has been released into
   * FinishedGoodsInventory by an accepted external QC report (P7). */
  released_quantity: number
  /** 'not_applicable' (not completed yet) | 'not_requested' | 'pending'
   * | 'released' | 'rejected' -- derived from this run's QC requests,
   * never the run's own execution status. See api/qcRequests.ts. */
  fg_release_status: 'not_applicable' | 'not_requested' | 'pending' | 'released' | 'rejected'
  /** Server-authoritative Kuwait time -- see core/timezone.py's
   * now_kuwait_naive. Never derive this from the browser's clock. */
  started_at: string
  ended_at: string | null
  duration_seconds: number | null
  status: ProductionExecutionStatus
  started_by: number | null
  completed_by: number | null
  cancel_reason: string | null
  notes: string | null
}

export interface ProductionExecutionSummary {
  production_order_id: number
  planned_quantity: number
  total_produced: number
  remaining_to_produce: number
  execution_status: ProductionExecutionOverallStatus
  runs: ProductionExecutionRun[]
}
