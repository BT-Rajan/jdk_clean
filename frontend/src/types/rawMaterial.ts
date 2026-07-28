/** Mirrors backend/app/schemas/raw_material.py. */
import type { ActiveStatus } from './customer'

export interface RawMaterial {
  id: number
  code: string
  name: string
  unit: string
  reorder_point: number
  default_supplier_id: number | null
  unit_cost: number
  status: ActiveStatus
}

export interface RawMaterialPayload {
  code: string
  name: string
  unit: string
  reorder_point?: number
  default_supplier_id?: number | null
  unit_cost?: number
  status?: ActiveStatus
}
