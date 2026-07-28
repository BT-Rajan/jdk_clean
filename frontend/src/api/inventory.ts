import type { PagedResponse } from '@/types/common'
import type {
  InventoryItemType,
  LowStockItem,
  StockAdjustPayload,
  StockLevel,
  StockMovement,
} from '@/types/inventory'
import { apiClient } from './client'

export async function getStock(itemType: InventoryItemType, itemId: number): Promise<StockLevel> {
  const { data } = await apiClient.get<StockLevel>(`/api/inventory/stock/${itemType}/${itemId}`)
  return data
}

export async function adjustStock(payload: StockAdjustPayload): Promise<StockLevel> {
  const { data } = await apiClient.post<StockLevel>('/api/inventory/adjust', payload)
  return data
}

export async function getLowStock(): Promise<LowStockItem[]> {
  const { data } = await apiClient.get<LowStockItem[]>('/api/inventory/low-stock')
  return data
}

export interface MovementQueryParams {
  item_type?: InventoryItemType
  item_id?: number
  reference_type?: string
  reference_id?: number
  page?: number
  page_size?: number
  sort?: string
}

export async function getMovements(params: MovementQueryParams): Promise<PagedResponse<StockMovement>> {
  const { data } = await apiClient.get<PagedResponse<StockMovement>>('/api/inventory/movements', { params })
  return data
}
