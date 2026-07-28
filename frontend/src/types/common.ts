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
}

/** Shape of the {"message": "..."} body returned by delete/restore endpoints. */
export interface MessageResponse {
  message: string
}
