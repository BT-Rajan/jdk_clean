/** Mirrors backend/app/schemas/inventory.py. */

export type InventoryItemType = 'product' | 'raw_material'
export type MovementType = 'receipt' | 'issue' | 'adjustment' | 'return'

export interface StockLevel {
  item_type: InventoryItemType
  item_id: number
  quantity_on_hand: number
  quantity_reserved: number
  quantity_available: number
}

export interface StockAdjustPayload {
  item_type: InventoryItemType
  item_id: number
  quantity: number
  movement_type: MovementType
  notes?: string | null
}

export interface LowStockItem {
  raw_material_id: number
  code: string
  name: string
  quantity_on_hand: number
  reorder_point: number
}

export interface FinishedGoodStockItem {
  product_id: number
  code: string
  name: string
  unit: string
  product_status: 'active' | 'inactive'
  quantity_on_hand: number
  quantity_reserved: number
  quantity_available: number
  reorder_point: number
  is_low: boolean
}

export interface StockMovement {
  id: number
  item_type: InventoryItemType
  item_id: number
  movement_type: MovementType
  quantity: number
  reference_type: string | null
  reference_id: number | null
  notes: string | null
  created_at: string
  created_by: number | null
}
