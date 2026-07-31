import type { BomExplosionResult, BomLine, BomLineInput } from '@/types/bom'
import { apiClient } from './client'

export async function getBom(productId: number): Promise<BomLine[]> {
  const { data } = await apiClient.get<BomLine[]>(`/api/products/${productId}/bom`)
  return data
}

export async function replaceBom(productId: number, lines: BomLineInput[]): Promise<BomLine[]> {
  const { data } = await apiClient.put<BomLine[]>(`/api/products/${productId}/bom`, { lines })
  return data
}

export async function addBomLine(productId: number, line: BomLineInput): Promise<BomLine> {
  const { data } = await apiClient.post<BomLine>(`/api/products/${productId}/bom/lines`, line)
  return data
}

export async function deleteBomLine(productId: number, lineId: number): Promise<void> {
  await apiClient.delete(`/api/products/${productId}/bom/lines/${lineId}`)
}

export async function explodeBom(productId: number, quantity: number): Promise<BomExplosionResult> {
  const { data } = await apiClient.get<BomExplosionResult>(`/api/products/${productId}/bom/explode`, {
    params: { quantity },
  })
  return data
}
