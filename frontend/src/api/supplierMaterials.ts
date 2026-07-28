import type { SupplierMaterial, SupplierMaterialInput } from '@/types/supplierMaterial'
import { apiClient } from './client'

export async function getSupplierMaterials(supplierId: number): Promise<SupplierMaterial[]> {
  const { data } = await apiClient.get<SupplierMaterial[]>(`/api/suppliers/${supplierId}/materials`)
  return data
}

export async function replaceSupplierMaterials(
  supplierId: number,
  lines: SupplierMaterialInput[],
): Promise<SupplierMaterial[]> {
  const { data } = await apiClient.put<SupplierMaterial[]>(`/api/suppliers/${supplierId}/materials`, {
    lines,
  })
  return data
}
