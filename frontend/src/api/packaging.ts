import type { PackagingLine, PackagingLineInput } from '@/types/packaging'
import { apiClient } from './client'

export async function getPackaging(productId: number): Promise<PackagingLine[]> {
  const { data } = await apiClient.get<PackagingLine[]>(`/api/products/${productId}/packaging`)
  return data
}

export async function replacePackaging(productId: number, lines: PackagingLineInput[]): Promise<PackagingLine[]> {
  const { data } = await apiClient.put<PackagingLine[]>(`/api/products/${productId}/packaging`, { lines })
  return data
}

export async function addPackagingLine(productId: number, line: PackagingLineInput): Promise<PackagingLine> {
  const { data } = await apiClient.post<PackagingLine>(`/api/products/${productId}/packaging/lines`, line)
  return data
}

export async function deletePackagingLine(productId: number, lineId: number): Promise<void> {
  await apiClient.delete(`/api/products/${productId}/packaging/lines/${lineId}`)
}
