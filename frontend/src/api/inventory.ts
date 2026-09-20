import type { PagedResponse } from '@/types/common'
import type {
  FinishedGoodStockItem,
  InventoryItemType,
  LowStockItem,
  RawMaterialStockItem,
  RawMaterialType,
  StockAdjustPayload,
  StockAdjustmentRequest,
  StockAdjustmentRequestStatus,
  StockAdjustmentResult,
  StockLevel,
  StockMovement,
} from '@/types/inventory'
import { apiClient } from './client'

export async function getStock(itemType: InventoryItemType, itemId: number): Promise<StockLevel> {
  const { data } = await apiClient.get<StockLevel>(`/api/inventory/stock/${itemType}/${itemId}`)
  return data
}

/** Always requires a reason; held for admin approval instead of applying
 * immediately once large enough -- see StockAdjustmentResult. */
export async function adjustStock(payload: StockAdjustPayload): Promise<StockAdjustmentResult> {
  const { data } = await apiClient.post<StockAdjustmentResult>('/api/inventory/adjust', payload)
  return data
}

export async function getLowStock(): Promise<LowStockItem[]> {
  const { data } = await apiClient.get<LowStockItem[]>('/api/inventory/low-stock')
  return data
}

export interface FinishedGoodsQueryParams {
  page?: number
  page_size?: number
  search?: string
  sort?: string
  low_only?: boolean
}

export async function getFinishedGoodsStock(
  params: FinishedGoodsQueryParams,
): Promise<PagedResponse<FinishedGoodStockItem>> {
  const { data } = await apiClient.get<PagedResponse<FinishedGoodStockItem>>('/api/inventory/finished-goods', {
    params,
  })
  return data
}

export interface RawMaterialStockQueryParams {
  page?: number
  page_size?: number
  search?: string
  sort?: string
  low_only?: boolean
  material_type?: RawMaterialType
}

/** Raw material equivalent of getFinishedGoodsStock -- on hand,
 * reserved, available, filterable by material_type so packaging stock
 * can be viewed independently from ordinary raw material stock. */
export async function getRawMaterialStock(
  params: RawMaterialStockQueryParams,
): Promise<PagedResponse<RawMaterialStockItem>> {
  const { data } = await apiClient.get<PagedResponse<RawMaterialStockItem>>('/api/inventory/raw-materials', {
    params,
  })
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

export interface AdjustmentRequestQueryParams {
  status?: StockAdjustmentRequestStatus
  page?: number
  page_size?: number
  sort?: string
}

export async function listAdjustmentRequests(
  params: AdjustmentRequestQueryParams,
): Promise<PagedResponse<StockAdjustmentRequest>> {
  const { data } = await apiClient.get<PagedResponse<StockAdjustmentRequest>>('/api/inventory/adjustment-requests', {
    params,
  })
  return data
}

export async function approveAdjustmentRequest(requestId: number): Promise<StockAdjustmentRequest> {
  const { data } = await apiClient.post<StockAdjustmentRequest>(
    `/api/inventory/adjustment-requests/${requestId}/approve`,
  )
  return data
}

export async function rejectAdjustmentRequest(requestId: number, reason: string): Promise<StockAdjustmentRequest> {
  const { data } = await apiClient.post<StockAdjustmentRequest>(
    `/api/inventory/adjustment-requests/${requestId}/reject`,
    { reason },
  )
  return data
}
