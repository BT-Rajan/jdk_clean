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
}

export type ProductionOrderScheduleStatus = 'unscheduled' | 'scheduled' | 'cancelled'

export interface ProductionOrderScheduleSummary {
  production_order_id: number
  due_date: string
  planned_quantity: number
  scheduled_quantity: number
  remaining_to_schedule: number
  schedule_status: ProductionOrderScheduleStatus
  schedules: ProductionOrderScheduleItem[]
}

export interface ProductionOrderScheduleCreatePayload {
  machine_id?: number | null
  planned_quantity?: number | null
  planned_start: string
  planned_end?: string | null
  notes?: string | null
}

export interface ProductionOrderScheduleUpdatePayload {
  machine_id?: number | null
  planned_quantity?: number | null
  planned_start?: string | null
  planned_end?: string | null
  notes?: string | null
}
