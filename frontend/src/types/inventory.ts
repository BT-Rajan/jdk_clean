/** Mirrors backend/app/schemas/inventory.py. */

export type InventoryItemType = 'product' | 'raw_material'
// The manual adjustment form only ever submits these four (see
// StockAdjustPayload below) -- receiving, fulfilment, production and
// supplier returns each write their own movement_type through their own
// service, never through this form.
export type MovementType = 'receipt' | 'issue' | 'adjustment' | 'return'
// The full set a StockMovement row can actually carry (backend
// app/models/inventory.py's movement_type enum) -- broader than
// MovementType above, since most of these come from other flows, not
// the manual adjustment form. 'reserve'/'release' are the reservation
// ledger entries written by reserve_stock/release_reservation.
export type AnyMovementType =
  | 'receipt'
  | 'issue'
  | 'adjustment'
  | 'production_in'
  | 'production_out'
  | 'return'
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
  // Outstanding quantity on an open purchase order -- always a real
  // number (0 when nothing's on order).
  incoming_quantity: number
  // From MRP -- only present when this material currently has live
  // production demand and a shortfall against on-hand stock. Null means
  // "no known requirement right now", not "confirmed zero demand".
  required_quantity: number | null
  shortfall: number | null
}

export interface StockMovement {
  id: number
  item_type: InventoryItemType
  item_id: number
  item_name: string | null
  item_route: string | null
  movement_type: AnyMovementType
  quantity: number
  reference_type: string | null
  reference_id: number | null
  reference_label: string | null
  reference_route: string | null
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
