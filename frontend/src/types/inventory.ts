/** Mirrors backend/app/schemas/inventory.py. */

export type InventoryItemType = 'product' | 'raw_material'
export type MovementType =
  | 'receipt'
  | 'issue'
  | 'adjustment'
  | 'return'
  | 'production_in'
  | 'production_out'
  | 'return_to_supplier'
  | 'reserve'
  | 'release'

export interface StockLevel {
  item_type: InventoryItemType
  item_id: number
  quantity_on_hand: number
  quantity_reserved: number
  quantity_available: number
  /** Set only when this StockLevel was returned by an action that just
   * created a movement -- the ledger entry that adjustment is traceable
   * to. null from a plain GET. */
  movement_id: number | null
}

export interface StockAdjustPayload {
  item_type: InventoryItemType
  item_id: number
  quantity: number
  movement_type: MovementType
  // Mandatory for every manual adjustment.
  notes: string
  // Required by the backend whenever item_type is 'raw_material' and
  // movement_type is 'receipt' -- see backend/app/schemas/inventory.py.
  supplier_id?: number | null
  unit_cost?: number | null
  batch_number?: string | null
  expiry_date?: string | null
  invoice_number?: string | null
  received_by?: string | null
  received_date?: string | null
}

/** 'applied' | 'pending_approval' -- see
 * backend/app/services/inventory_service.py's submit_manual_adjustment. */
export interface StockAdjustmentResult {
  status: 'applied' | 'pending_approval'
  stock: StockLevel | null
  request: StockAdjustmentRequest | null
}

export type StockAdjustmentRequestStatus = 'pending' | 'applied' | 'rejected'

export interface StockAdjustmentRequest {
  id: number
  item_type: InventoryItemType
  item_id: number
  quantity: number
  movement_type: MovementType
  reason: string
  supplier_id: number | null
  unit_cost: number | null
  batch_number: string | null
  expiry_date: string | null
  invoice_number: string | null
  received_by: string | null
  received_date: string | null
  status: StockAdjustmentRequestStatus
  rejection_reason: string | null
  resulting_movement_id: number | null
  requested_by: number | null
  requested_at: string
  decided_by: number | null
  decided_at: string | null
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

/** 'raw_material' | 'packaging' | 'consumable' -- see
 * backend/app/models/raw_material.py's material_type. */
export type RawMaterialType = 'raw_material' | 'packaging' | 'consumable'

export interface RawMaterialStockItem {
  raw_material_id: number
  code: string
  name: string
  unit: string
  material_type: RawMaterialType
  material_status: 'active' | 'inactive'
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
  supplier_id: number | null
  unit_cost: number | null
  batch_number: string | null
  expiry_date: string | null
  invoice_number: string | null
  received_by: string | null
  received_date: string | null
  notes: string | null
  created_at: string
  created_by: number | null
}
