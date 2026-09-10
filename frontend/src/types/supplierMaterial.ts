/** Mirrors backend/app/schemas/supplier_material.py. */

export type SupplierMaterialStatus = 'active' | 'inactive'

export interface SupplierMaterial {
  id: number
  supplier_id: number
  raw_material_id: number
  supplier_code: string | null
  supplier_name: string | null
  material_code: string | null
  material_name: string | null
  material_unit: string | null
  supplier_material_code: string | null
  purchase_price: number
  currency: string
  max_supply_quantity: number
  lead_time_days: number | null
  moq: number
  is_preferred: boolean
  status: SupplierMaterialStatus
  /** Both auto-captured -- never user-entered. */
  onboarded_at: string
  last_transaction_at: string | null
  created_at: string
  updated_at: string
}

/** Full-replace line, sent from the supplier's own "materials supplied" editor. */
export interface SupplierMaterialInput {
  raw_material_id: number
  supplier_material_code?: string | null
  purchase_price?: number
  currency?: string
  max_supply_quantity: number
  lead_time_days?: number | null
  moq?: number
  is_preferred?: boolean
  status?: SupplierMaterialStatus
}

/** Adding one supplier to a material from the material's Procurement panel --
 * the mirror image of SupplierMaterialInput (carries supplier_id instead of
 * raw_material_id, which is implied by the URL). */
export interface SupplierMaterialForMaterialInput {
  supplier_id: number
  supplier_material_code?: string | null
  purchase_price?: number
  currency?: string
  max_supply_quantity: number
  lead_time_days?: number | null
  moq?: number
  is_preferred?: boolean
  status?: SupplierMaterialStatus
}

/** Patches one existing line -- every field optional. */
export type SupplierMaterialLineUpdate = Partial<SupplierMaterialForMaterialInput>
