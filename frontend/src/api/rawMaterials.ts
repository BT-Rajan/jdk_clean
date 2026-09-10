import type { PagedResponse, ListQueryParams, MessageResponse } from '@/types/common'
import type { RawMaterial, RawMaterialPayload } from '@/types/rawMaterial'
import type {
  SupplierMaterial,
  SupplierMaterialForMaterialInput,
  SupplierMaterialLineUpdate,
} from '@/types/supplierMaterial'
import type {
  RawMaterialAlternative,
  RawMaterialAlternativeInput,
  RawMaterialAlternativeUpdate,
} from '@/types/rawMaterialAlternative'
import { apiClient } from './client'

export async function listRawMaterials(params: ListQueryParams): Promise<PagedResponse<RawMaterial>> {
  const { data } = await apiClient.get<PagedResponse<RawMaterial>>('/api/raw-materials', { params })
  return data
}

export async function getRawMaterial(id: number): Promise<RawMaterial> {
  const { data } = await apiClient.get<RawMaterial>(`/api/raw-materials/${id}`)
  return data
}

export async function createRawMaterial(payload: RawMaterialPayload): Promise<RawMaterial> {
  const { data } = await apiClient.post<RawMaterial>('/api/raw-materials', payload)
  return data
}

export async function updateRawMaterial(id: number, payload: Partial<RawMaterialPayload>): Promise<RawMaterial> {
  const { data } = await apiClient.put<RawMaterial>(`/api/raw-materials/${id}`, payload)
  return data
}

export async function deleteRawMaterial(id: number): Promise<MessageResponse> {
  const { data } = await apiClient.delete<MessageResponse>(`/api/raw-materials/${id}`)
  return data
}

export async function restoreRawMaterial(id: number): Promise<RawMaterial> {
  const { data } = await apiClient.post<RawMaterial>(`/api/raw-materials/${id}/restore`)
  return data
}

// -- Procurement / Suppliers (material-owned mirror of
// api/supplierMaterials.ts's supplier-owned endpoints) --

export async function getMaterialSuppliers(rawMaterialId: number): Promise<SupplierMaterial[]> {
  const { data } = await apiClient.get<SupplierMaterial[]>(`/api/raw-materials/${rawMaterialId}/suppliers`)
  return data
}

export async function addMaterialSupplier(
  rawMaterialId: number,
  payload: SupplierMaterialForMaterialInput,
): Promise<SupplierMaterial> {
  const { data } = await apiClient.post<SupplierMaterial>(`/api/raw-materials/${rawMaterialId}/suppliers`, payload)
  return data
}

export async function updateMaterialSupplier(
  rawMaterialId: number,
  lineId: number,
  payload: SupplierMaterialLineUpdate,
): Promise<SupplierMaterial> {
  const { data } = await apiClient.put<SupplierMaterial>(
    `/api/raw-materials/${rawMaterialId}/suppliers/${lineId}`,
    payload,
  )
  return data
}

export async function removeMaterialSupplier(rawMaterialId: number, lineId: number): Promise<MessageResponse> {
  const { data } = await apiClient.delete<MessageResponse>(`/api/raw-materials/${rawMaterialId}/suppliers/${lineId}`)
  return data
}

// -- Approved alternatives --

export async function getMaterialAlternatives(rawMaterialId: number): Promise<RawMaterialAlternative[]> {
  const { data } = await apiClient.get<RawMaterialAlternative[]>(`/api/raw-materials/${rawMaterialId}/alternatives`)
  return data
}

export async function addMaterialAlternative(
  rawMaterialId: number,
  payload: RawMaterialAlternativeInput,
): Promise<RawMaterialAlternative> {
  const { data } = await apiClient.post<RawMaterialAlternative>(
    `/api/raw-materials/${rawMaterialId}/alternatives`,
    payload,
  )
  return data
}

export async function updateMaterialAlternative(
  rawMaterialId: number,
  alternativeId: number,
  payload: RawMaterialAlternativeUpdate,
): Promise<RawMaterialAlternative> {
  const { data } = await apiClient.put<RawMaterialAlternative>(
    `/api/raw-materials/${rawMaterialId}/alternatives/${alternativeId}`,
    payload,
  )
  return data
}

export async function removeMaterialAlternative(
  rawMaterialId: number,
  alternativeId: number,
): Promise<MessageResponse> {
  const { data } = await apiClient.delete<MessageResponse>(
    `/api/raw-materials/${rawMaterialId}/alternatives/${alternativeId}`,
  )
  return data
}
