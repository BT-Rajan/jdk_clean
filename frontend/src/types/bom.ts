/** Mirrors backend/app/schemas/bom.py. */

export type ComponentType = 'raw_material' | 'product'

export interface BomLine {
  id: number
  parent_product_id: number
  component_type: ComponentType
  component_id: number
  component_code: string | null
  component_name: string | null
  quantity: number
  unit: string
  scrap_percent: number
  created_at: string
  updated_at: string
}

export interface BomLineInput {
  component_type: ComponentType
  component_id: number
  quantity: number
  unit: string
  scrap_percent?: number
}

export interface RequirementLine {
  raw_material_id: number
  code: string | null
  name: string | null
  unit: string | null
  quantity_required: number
}

export interface BomExplosionResult {
  product_id: number
  quantity_requested: number
  requirements: RequirementLine[]
}
