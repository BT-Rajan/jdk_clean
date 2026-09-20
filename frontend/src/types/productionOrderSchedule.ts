/** Mirrors backend/app/schemas/production_order_schedule.py. */

import type { ProductionStatus } from './production'

export interface ProductionOrderScheduleItem {
  id: number
  batch_number: string
  machine_id: number | null
  machine_name: string | null
  planned_quantity: number
  scheduled_start: string
  scheduled_end: string
  /** Time-of-day precision -- always set for a schedule created through
   * this flow (see api/productionOrders.ts's createSchedule). */
  planned_start: string | null
  planned_end: string | null
  status: ProductionStatus
  cancel_reason: string | null
  notes: string | null
  /** Whether this schedule's own completion is on time against the
   * Production Order's due date -- computed server-side, never derived
   * again here, so there's one place that can get "late" wrong. */
  due_date_status: 'on_or_before_due' | 'after_due'
  /** Set only when this schedule's planned_quantity was explicitly
   * allowed to exceed the production order's remaining unscheduled
   * quantity -- see ProductionOrderScheduleCreatePayload.allow_overproduction. */
  overproduction_reason: string | null
}

export type ProductionOrderScheduleStatus = 'unscheduled' | 'scheduled' | 'cancelled'
/** 'not_applicable' -- no active schedule to check yet. */
export type MachineReadinessStatus = 'ready' | 'not_ready' | 'not_applicable'

export interface ProductionOrderScheduleSummary {
  production_order_id: number
  due_date: string
  planned_quantity: number
  scheduled_quantity: number
  remaining_to_schedule: number
  schedule_status: ProductionOrderScheduleStatus
  /** Earliest/latest planned_end across whatever's still active -- null
   * when nothing active exists yet to estimate from. */
  earliest_completion_date: string | null
  latest_completion_date: string | null
  machine_status: MachineReadinessStatus
  /** Batch numbers of any active schedule whose machine has since gone
   * inactive/deleted -- empty unless machine_status is 'not_ready'. */
  machine_issues: string[]
  active_schedules: ProductionOrderScheduleItem[]
  cancelled_schedules: ProductionOrderScheduleItem[]
}

export interface ProductionOrderScheduleCreatePayload {
  machine_id?: number | null
  planned_quantity?: number | null
  planned_start: string
  planned_end?: string | null
  notes?: string | null
  /** When planned_quantity would exceed the production order's
   * remaining unscheduled quantity, the request is rejected unless this
   * is true -- and then overproduction_reason becomes mandatory. */
  allow_overproduction?: boolean
  overproduction_reason?: string | null
}

export interface ProductionOrderScheduleUpdatePayload {
  machine_id?: number | null
  planned_quantity?: number | null
  planned_start?: string | null
  planned_end?: string | null
  notes?: string | null
  allow_overproduction?: boolean
  overproduction_reason?: string | null
}
