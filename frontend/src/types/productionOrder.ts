/** Mirrors backend/app/schemas/production_order.py. */

export type ProductionOrderStatus = 'planned' | 'cancelled'
export type ProductionOrderPriority = 'low' | 'normal' | 'high' | 'urgent'

export interface ProductionOrder {
  id: number
  production_order_number: string
  /** null together with order_detail_id means a stock-only production
   * order -- built to replenish general Finished Goods stock, not tied
   * to any customer order (see backend/app/models/production_order.py). */
  order_id: number | null
  order_number: string | null
  customer_id: number | null
  customer_name: string | null
  order_detail_id: number | null
  product_id: number
  product_code: string | null
  product_name: string | null
  unit: string | null
  ordered_quantity: number | null
  planned_quantity: number
  /** How much of this order line has yet to be committed to ANY
   * Production Order -- computed server-side, not stored. Does not net
   * off actual output (there is none yet -- execution is a later pass). */
  remaining_order_quantity: number | null
  due_date: string
  priority: ProductionOrderPriority
  status: ProductionOrderStatus
  cancel_reason: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

/** Exactly one of order_detail_id (order-linked) or product_id
 * (stock-only) must be given -- see ProductionOrderCreate in
 * backend/app/schemas/production_order.py. order_id is never sent: the
 * server derives it from order_detail_id. */
export type ProductionOrderPayload =
  | {
      order_detail_id: number
      product_id?: never
      planned_quantity: number
      due_date: string
      priority?: ProductionOrderPriority
      notes?: string | null
    }
  | {
      order_detail_id?: never
      product_id: number
      planned_quantity: number
      due_date: string
      priority?: ProductionOrderPriority
      notes?: string | null
    }

/** 'planned' is the creation default and never set directly, same
 * exclusion pattern every other status type in this app uses. */
export type SettableProductionOrderStatus = Exclude<ProductionOrderStatus, 'planned'>
