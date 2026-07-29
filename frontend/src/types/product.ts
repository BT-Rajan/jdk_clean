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
  // "Formula": which machine makes this product, how many hours of that
  // machine's time one unit takes, and how many workers it needs
  // concurrently -- used by the feasibility check's machine-availability /
  // time-required / labor calculation, alongside the product's BOM.
  machine_id: number | null
  production_hours_per_unit: number | null
  workers_required: number | null
  status: ActiveStatus
}

export interface ProductPayload {
  code: string
  name: string
  unit: string
  product_type?: ProductType
  selling_price?: number
  machine_id?: number | null
  production_hours_per_unit?: number | null
  workers_required?: number | null
  status?: ActiveStatus
}
