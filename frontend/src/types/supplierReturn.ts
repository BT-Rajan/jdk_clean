/** Mirrors backend/app/schemas/supplier_return.py. */

export interface SupplierReturnLine {
  id: number
  raw_material_id: number
  material_code: string | null
  material_name: string | null
  unit: string | null
  quantity: number
}

export interface SupplierReturn {
  id: number
  return_number: string
  supplier_id: number
  supplier_code: string | null
  supplier_name: string | null
  purchase_order_id: number | null
  po_number: string | null
  return_date: string
  reason: string
  notes: string | null
  lines: SupplierReturnLine[]
  created_at: string
  created_by_name: string | null
}

export interface SupplierReturnLineInput {
  raw_material_id: number
  quantity: number
}

export interface SupplierReturnPayload {
  supplier_id: number
  purchase_order_id?: number | null
  return_date: string
  reason: string
  notes?: string | null
  lines: SupplierReturnLineInput[]
}
