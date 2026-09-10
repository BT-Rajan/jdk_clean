/** Mirrors backend/app/schemas/bom.py. */
import type { RawMaterialType } from './rawMaterial'

export type ComponentType = 'raw_material' | 'product'
export type BomStatus = 'active' | 'inactive'

export interface BomLine {
  id: number
  parent_product_id: number
  component_type: ComponentType
  component_id: number
  component_code: string | null
  component_name: string | null
  /** Only set for component_type === 'raw_material' -- the Raw Material
   * Master's own classification, not BOM data. */
  component_material_type: RawMaterialType | null
  /** Live on-hand stock for the component (raw materials only). */
  component_on_hand: number | null
  quantity: number
  unit: string
  scrap_percent: number
  /** quantity inflated by scrap_percent -- what this line actually
   * consumes per output_quantity batch. Computed server-side so every
   * reader (this table, Production, MRP) sees the identical figure. */
  effective_quantity: number
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

/** The BOM "header" -- at most one per product. Owns only batch size,
 * active status and notes; everything about the product itself stays on
 * Product (see backend/app/models/bom.py's Bom docstring). */
export interface BomHeader {
  id: number
  bom_number: string
  product_id: number
  /** The batch size every line's `quantity` is expressed against. */
  output_quantity: number
  status: BomStatus
  notes: string | null
  component_count: number
  created_at: string
  updated_at: string
}

export interface BomHeaderCreateInput {
  output_quantity?: number
  notes?: string | null
}

export interface BomHeaderUpdateInput {
  output_quantity?: number
  status?: BomStatus
  notes?: string | null
}
