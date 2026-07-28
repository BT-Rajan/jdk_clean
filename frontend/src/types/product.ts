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
  status: ActiveStatus
}

export interface ProductPayload {
  code: string
  name: string
  unit: string
  product_type?: ProductType
  selling_price?: number
  status?: ActiveStatus
}
