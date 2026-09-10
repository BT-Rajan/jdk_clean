/** Mirrors backend/app/schemas/raw_material_alternative.py. */

export type RawMaterialAlternativeStatus = 'approved' | 'blocked'

export interface RawMaterialAlternative {
  id: number
  raw_material_id: number
  alternative_material_id: number
  alternative_code: string | null
  alternative_name: string | null
  alternative_unit: string | null
  priority: number
  status: RawMaterialAlternativeStatus
  conversion_ratio: number
  notes: string | null
  created_at: string
  updated_at: string
}

export interface RawMaterialAlternativeInput {
  alternative_material_id: number
  priority?: number
  status?: RawMaterialAlternativeStatus
  conversion_ratio?: number
  notes?: string | null
}

export interface RawMaterialAlternativeUpdate {
  priority?: number
  status?: RawMaterialAlternativeStatus
  conversion_ratio?: number
  notes?: string | null
}
