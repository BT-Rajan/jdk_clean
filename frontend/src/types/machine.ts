/** Mirrors backend/app/schemas/machine.py. */
import type { ActiveStatus } from './customer'

export interface Machine {
  id: number
  code: string
  name: string
  capacity_hours_per_day: number
  status: ActiveStatus
}

export interface MachinePayload {
  code: string
  name: string
  capacity_hours_per_day?: number
  status?: ActiveStatus
}
