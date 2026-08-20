/** Mirrors backend/app/schemas/packaging.py. */

export interface PackagingLine {
  id: number
  product_id: number
  packaging_material_id: number
  packaging_material_code: string | null
  packaging_material_name: string | null
  quantity_per_unit: number
  unit: string
  created_at: string
  updated_at: string
}

export interface PackagingLineInput {
  packaging_material_id: number
  quantity_per_unit: number
  unit: string
}
