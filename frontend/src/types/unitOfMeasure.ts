export type UomCategory = 'weight' | 'count' | 'volume'
export type UomStatus = 'active' | 'inactive'

export interface UnitOfMeasure {
  id: number
  code: string
  name: string
  category: UomCategory
  factor_to_base: number
  is_base: boolean
  status: UomStatus
}

export interface UnitOfMeasureCreatePayload {
  code: string
  name: string
  category: UomCategory
  factor_to_base: number
  is_base?: boolean
  status?: UomStatus
}

// code and category are not editable once created -- see
// backend/app/schemas/unit_of_measure.py.
export interface UnitOfMeasureUpdatePayload {
  name?: string
  factor_to_base?: number
  is_base?: boolean
  status?: UomStatus
}
