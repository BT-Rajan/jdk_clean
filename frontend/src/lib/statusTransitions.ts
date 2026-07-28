import type { QuotationStatus, SettableQuotationStatus } from '@/types/quotation'
import type { OrderStatus, SettableOrderStatus } from '@/types/order'
import type { ProductionStatus, SettableProductionStatus } from '@/types/production'

/** Mirrors ALLOWED_TRANSITIONS in backend/app/models/quotation.py. Drives
 * which status-change buttons the detail page offers -- 'converted' is
 * deliberately excluded since it's only reachable via convert-to-order. */
export const QUOTATION_TRANSITIONS: Record<QuotationStatus, SettableQuotationStatus[]> = {
  draft: ['sent', 'rejected'],
  sent: ['accepted', 'rejected', 'expired'],
  accepted: [],
  rejected: [],
  expired: [],
  converted: [],
}

/** Mirrors ALLOWED_TRANSITIONS in backend/app/models/order.py. */
export const ORDER_TRANSITIONS: Record<OrderStatus, SettableOrderStatus[]> = {
  draft: ['confirmed', 'cancelled'],
  confirmed: ['in_production', 'cancelled'],
  in_production: ['ready_to_ship', 'cancelled'],
  ready_to_ship: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
}

/** Mirrors ALLOWED_TRANSITIONS in backend/app/models/production_schedule.py.
 * 'completed' additionally requires a produced_quantity, handled by the
 * detail page prompting for it rather than being a plain one-click button
 * like the others. */
export const PRODUCTION_TRANSITIONS: Record<ProductionStatus, SettableProductionStatus[]> = {
  planned: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
}
