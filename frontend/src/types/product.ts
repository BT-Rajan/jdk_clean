/** Mirrors backend/app/schemas/product.py. */
import type { ActiveStatus } from './customer'

export type ProductType = 'finished_good' | 'sub_assembly'

export interface Product {
  id: number
  code: string
  name: string
  unit: string
  product_type: ProductType
  selling_price: number
  // How production time is entered: as one batch ("500 units, 6 hours"),
  // not a per-unit number. When both are set, production_hours_per_unit
  // is kept in sync as batch_production_hours / batch_size server-side.
  batch_size: number | null
  batch_production_hours: number | null
  // "Formula": which machine makes this product, how many hours of that
  // machine's time one unit takes, and how many workers it needs
  // concurrently -- used by the feasibility check's machine-availability /
  // time-required / labor calculation, alongside the product's BOM.
  machine_id: number | null
  production_hours_per_unit: number | null
  workers_required: number | null
  status: ActiveStatus
  // Descriptive only -- not read by feasibility/BOM/capacity logic.
  // Free-form labels (filtering/grouping) and arbitrary spec key-value
  // pairs (e.g. color, shelf life).
  tags: string[] | null
  properties: Record<string, string> | null
  // Finished-goods equivalent of RawMaterial.reorder_point -- flags this
  // product as low stock once quantity_on_hand drops to/below it.
  reorder_point: number
}

export interface ProductSupplierLine {
  supplier_id: number
  supplier_code: string
  supplier_name: string
  is_default: boolean
  max_supply_quantity: number | null
  lead_time_days: number | null
}

export interface ProductSupplierMaterial {
  raw_material_id: number
  raw_material_code: string
  raw_material_name: string
  unit: string
  suppliers: ProductSupplierLine[]
}

export interface ProductSuppliersResult {
  product_id: number
  materials: ProductSupplierMaterial[]
}

export interface ProductPayload {
  code: string
  name: string
  unit: string
  product_type?: ProductType
  selling_price?: number
  batch_size?: number | null
  batch_production_hours?: number | null
  machine_id?: number | null
  production_hours_per_unit?: number | null
  workers_required?: number | null
  status?: ActiveStatus
  tags?: string[] | null
  properties?: Record<string, string> | null
  reorder_point?: number
}
