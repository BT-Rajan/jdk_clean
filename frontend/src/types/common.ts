/**
 * Mirrors backend/app/api/common.py PagedResponse and backend/app/api/deps.py
 * ListParams. Every list endpoint in the API (customers, suppliers,
 * raw-materials, products, quotations, orders, users) returns this shape.
 */
export interface PagedResponse<T> {
  items: T[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

export interface ListQueryParams {
  page?: number
  page_size?: number
  search?: string
  sort?: string
  status?: string
  // Mirrors the rest of backend/app/api/deps.py:ListParams' whitelist --
  // harmless to send one a given endpoint's CRUD class doesn't declare
  // in filterable_fields, it's just ignored server-side.
  city?: string
  country?: string
  mode_of_supply?: string
  role?: string
  product_type?: string
  category?: string
  department_id?: number
}

/** Shape of the {"message": "..."} body returned by delete/restore endpoints. */
export interface MessageResponse {
  message: string
}
