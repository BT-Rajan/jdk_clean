/** Mirrors backend/app/schemas/raw_material.py. */
import type { ActiveStatus } from './customer'

export type RawMaterialType = 'raw_material' | 'packaging' | 'consumable'
export type RawMaterialStatus = ActiveStatus | 'blocked'

export const RAW_MATERIAL_TYPE_LABELS: Record<RawMaterialType, string> = {
  raw_material: 'Raw material',
  packaging: 'Packaging',
  consumable: 'Consumable',
}

export interface RawMaterial {
  id: number
  code: string
  name: string
  unit: string
  material_type: RawMaterialType
  category: string | null
  description: string | null
  properties: Record<string, string> | null
  manufacturer: string | null
  manufacturer_part_number: string | null

  reorder_point: number
  safety_stock: number
  maximum_stock: number
  storage_location: string | null

  default_supplier_id: number | null
  unit_cost: number

  inspection_required: boolean
  certificate_required: boolean
  qc_notes: string | null

  status: RawMaterialStatus
}

export interface RawMaterialPayload {
  code: string
  name: string
  unit: string
  material_type?: RawMaterialType
  category?: string | null
  description?: string | null
  properties?: Record<string, string> | null
  manufacturer?: string | null
  manufacturer_part_number?: string | null

  reorder_point?: number
  safety_stock?: number
  maximum_stock?: number
  storage_location?: string | null

  default_supplier_id?: number | null
  unit_cost?: number

  inspection_required?: boolean
  certificate_required?: boolean
  qc_notes?: string | null

  status?: RawMaterialStatus
}
