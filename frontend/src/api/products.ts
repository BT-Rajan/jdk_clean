import type { PagedResponse, ListQueryParams, MessageResponse } from '@/types/common'
import type { Product, ProductPayload, ProductSuppliersResult } from '@/types/product'
import { apiClient } from './client'

export async function listProducts(params: ListQueryParams): Promise<PagedResponse<Product>> {
  const { data } = await apiClient.get<PagedResponse<Product>>('/api/products', { params })
  return data
}

export async function getProduct(id: number): Promise<Product> {
  const { data } = await apiClient.get<Product>(`/api/products/${id}`)
  return data
}

export async function createProduct(payload: ProductPayload): Promise<Product> {
  const { data } = await apiClient.post<Product>('/api/products', payload)
  return data
}

export async function updateProduct(id: number, payload: Partial<ProductPayload>): Promise<Product> {
  const { data } = await apiClient.put<Product>(`/api/products/${id}`, payload)
  return data
}

export async function deleteProduct(id: number): Promise<MessageResponse> {
  const { data } = await apiClient.delete<MessageResponse>(`/api/products/${id}`)
  return data
}

export async function restoreProduct(id: number): Promise<Product> {
  const { data } = await apiClient.post<Product>(`/api/products/${id}/restore`)
  return data
}

export async function activateProduct(id: number): Promise<Product> {
  const { data } = await apiClient.post<Product>(`/api/products/${id}/activate`)
  return data
}

export async function deactivateProduct(id: number): Promise<Product> {
  const { data } = await apiClient.post<Product>(`/api/products/${id}/deactivate`)
  return data
}

/** Admin-only -- see api/products.py:get_product_suppliers. */
export async function getProductSuppliers(id: number): Promise<ProductSuppliersResult> {
  const { data } = await apiClient.get<ProductSuppliersResult>(`/api/products/${id}/suppliers`)
  return data
}
