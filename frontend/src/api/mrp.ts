import type { MrpCreatePoPayload, MrpReport } from '@/types/mrp'
import type { PurchaseOrder } from '@/types/purchaseOrder'
import { apiClient } from './client'

export async function getMrpReport(): Promise<MrpReport> {
  const { data } = await apiClient.get<MrpReport>('/api/mrp')
  return data
}

/** One-click "Create PO" directly against a single MRP shortage's
 * suggested purchase -- see backend/app/services/purchase_order_service.py's
 * create_purchase_order_for_shortage. */
export async function createPoForShortage(payload: MrpCreatePoPayload): Promise<PurchaseOrder> {
  const { data } = await apiClient.post<PurchaseOrder>('/api/mrp/create-po', payload)
  return data
}
