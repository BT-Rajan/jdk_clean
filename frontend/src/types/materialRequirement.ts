/** Mirrors backend/app/schemas/production_order_material.py. */

export type MaterialRequirementOverallStatus = 'not_calculated' | 'available' | 'short'

export interface MaterialRequirementItem {
  id: number
  raw_material_id: number
  code: string
  name: string
  unit: string
  /** Mirrors RawMaterial.material_type -- the existing classification,
   * not a new taxonomy. */
  material_type: 'raw_material' | 'packaging' | 'consumable'
  material_type_label: string
  source: 'bom' | 'packaging'
  bom_id: number | null
  bom_number: string | null
  required_quantity: number
  /** Computed live from inventory at read time -- not stored. */
  available_quantity: number
  shortage_quantity: number
}

export interface MaterialRequirementSummary {
  production_order_id: number
  overall_status: MaterialRequirementOverallStatus
  calculated_at: string | null
  items: MaterialRequirementItem[]
}
