/** Mirrors backend/app/schemas/supplier_material.py. */

export interface SupplierMaterial {
  id: number
  supplier_id: number
  raw_material_id: number
  material_code: string | null
  material_name: string | null
  material_unit: string | null
  max_supply_quantity: number
  lead_time_days: number | null
  created_at: string
  updated_at: string
}

export interface SupplierMaterialInput {
  raw_material_id: number
  max_supply_quantity: number
  lead_time_days?: number | null
}
