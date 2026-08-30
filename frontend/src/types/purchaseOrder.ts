/** Mirrors backend/app/schemas/purchase_order.py. */

export type PurchaseOrderStatus =
  | 'draft'
  | 'sent'
  | 'confirmed'
  | 'partially_received'
  | 'received'
  | 'cancelled'

export interface PurchaseOrderLine {
  id: number
  raw_material_id: number
  material_code: string | null
  material_name: string | null
  unit: string | null
  quantity: number
  unit_price: number
  discount_percent: number
  line_total: number
  received_quantity: number
}

export interface PurchaseOrder {
  id: number
  po_number: string
  supplier_id: number
  supplier_code: string | null
  supplier_name: string | null
  supplier_email: string | null
  order_date: string
  expected_delivery_date: string | null
  status: PurchaseOrderStatus
  subtotal_amount: number
  discount_percent: number
  discount_amount: number
  total_amount: number
  notes: string | null
  /** True when the system drafted this automatically from an MRP
   * shortage, rather than a person creating it. */
  auto_created: boolean
  cancel_reason: string | null
  /** Set once an admin has approved this PO past the large-PO threshold
   * (Settings -> large_po_approval_threshold). Null if never required or
   * not yet approved. */
  approved_at: string | null
  admin_review_required: boolean
  admin_reviewed_at: string | null
  admin_review_notes: string | null
  lines: PurchaseOrderLine[]
  created_at: string
  updated_at: string
}

export interface PurchaseOrderLineInput {
  raw_material_id: number
  quantity: number
  unit_price: number
  discount_percent?: number
}

export interface PurchaseOrderPayload {
  supplier_id: number
  order_date: string
  expected_delivery_date?: string | null
  notes?: string | null
  discount_percent?: number
  lines: PurchaseOrderLineInput[]
}

/** 'draft' is only set at creation, and 'partially_received'/'received'
 * only happen as a side effect of receive_lines -- neither is settable
 * via the plain status endpoint. */
export type SettablePurchaseOrderStatus = 'sent' | 'confirmed' | 'cancelled'
