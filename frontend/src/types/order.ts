/** Mirrors backend/app/schemas/order.py. */

export type OrderStatus =
  | 'draft'
  | 'confirmed'
  | 'in_production'
  | 'ready_to_ship'
  | 'shipped'
  | 'delivered'
  | 'cancelled'

export interface OrderLineInput {
  product_id: number
  quantity: number
  unit_price: number
  discount_percent?: number
}

export interface OrderLine extends OrderLineInput {
  id: number
  product_code: string | null
  product_name: string | null
  unit: string | null
  discount_percent: number
  line_total: number
}

export interface Order {
  id: number
  order_number: string
  customer_id: number
  customer_name: string | null
  customer_email: string | null
  deal_id: number | null
  deal_number: string | null
  order_date: string
  requested_delivery_date: string | null
  confirmed_delivery_date: string | null
  status: OrderStatus
  subtotal_amount: number
  discount_percent: number
  discount_amount: number
  tax_rate: number
  tax_amount: number
  total_amount: number
  notes: string | null
  close_reason: string | null
  /** Set once an admin has approved a large discount on this order
   * (Settings -> large_discount_approval_threshold). Null if never
   * required or not yet approved. */
  approved_at: string | null
  admin_review_required: boolean
  admin_reviewed_at: string | null
  admin_review_notes: string | null
  lines: OrderLine[]
  created_at: string
  updated_at: string
}

export interface OrderPayload {
  customer_id: number
  order_date: string
  requested_delivery_date?: string | null
  notes?: string | null
  tax_rate?: number
  discount_percent?: number
  lines: OrderLineInput[]
}

export type SettableOrderStatus = Exclude<OrderStatus, 'draft'>
