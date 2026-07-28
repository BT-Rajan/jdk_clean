import type { QuotationStatus, SettableQuotationStatus } from '@/types/quotation'
import type { OrderStatus, SettableOrderStatus } from '@/types/order'

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
