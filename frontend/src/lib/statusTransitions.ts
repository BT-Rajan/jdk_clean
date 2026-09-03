import type { QuotationStatus, SettableQuotationStatus } from '@/types/quotation'
import type { OrderStatus, SettableOrderStatus } from '@/types/order'
import type { ProductionStatus, SettableProductionStatus } from '@/types/production'
import type { PurchaseOrderStatus, SettablePurchaseOrderStatus } from '@/types/purchaseOrder'
import type { DeliveryNoteStatus, SettableDeliveryNoteStatus } from '@/types/deliveryNote'
import type { CustomerOnboardingStatus } from '@/types/customer'

/** Mirrors ONBOARDING_ALLOWED_TRANSITIONS in backend/app/models/customer.py. */
export const CUSTOMER_ONBOARDING_TRANSITIONS: Record<CustomerOnboardingStatus, CustomerOnboardingStatus[]> = {
  pending: ['under_review'],
  under_review: ['active', 'rejected', 'pending'],
  active: ['on_hold'],
  on_hold: ['under_review', 'active'],
  rejected: ['pending'],
}
/** Mirrors backend/app/models/customer.py ONBOARDING_STATUSES_REQUIRING_REASON. */
export const CUSTOMER_ONBOARDING_STATUSES_REQUIRING_REASON: CustomerOnboardingStatus[] = ['rejected', 'on_hold']

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
/** Mirrors backend/app/models/quotation.py STATUSES_REQUIRING_CLOSE_REASON. */
export const QUOTATION_STATUSES_REQUIRING_REASON: SettableQuotationStatus[] = ['rejected']

/** Mirrors ALLOWED_TRANSITIONS in backend/app/models/order.py. 'ready_to_ship'
 * is reachable directly from 'confirmed' -- not just via 'in_production' --
 * for an order fully covered by existing finished-goods stock, where
 * nothing actually needs producing (see order_service._maybe_auto_schedule_
 * production); a person can choose it directly for the same reason. */
export const ORDER_TRANSITIONS: Record<OrderStatus, SettableOrderStatus[]> = {
  draft: ['confirmed', 'cancelled'],
  confirmed: ['in_production', 'ready_to_ship', 'cancelled'],
  in_production: ['ready_to_ship', 'cancelled'],
  ready_to_ship: ['shipped', 'cancelled'],
  // Cancelling after shipment/delivery is a real after-the-fact
  // cancellation (goods refused/returned) -- the backend reverses the
  // delivered stock back onto the shelf rather than just flipping status.
  shipped: ['delivered', 'cancelled'],
  delivered: ['cancelled'],
  cancelled: [],
}
/** Mirrors backend/app/models/order.py STATUSES_REQUIRING_CLOSE_REASON. */
export const ORDER_STATUSES_REQUIRING_REASON: SettableOrderStatus[] = ['cancelled']

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
/** Cancelling a batch now requires a reason, same as orders/quotations/
 * feasibility -- previously the only module missing this. */
export const PRODUCTION_STATUSES_REQUIRING_REASON: SettableProductionStatus[] = ['cancelled']

/** Mirrors ALLOWED_TRANSITIONS in backend/app/models/purchase_order.py.
 * 'partially_received' and 'received' are reached via the dedicated
 * receive action (see api/purchaseOrders.ts:receivePurchaseOrder), not
 * this plain status endpoint -- so they're not listed as targets here,
 * matching what the backend actually accepts on /status. */
export const PURCHASE_ORDER_TRANSITIONS: Record<PurchaseOrderStatus, SettablePurchaseOrderStatus[]> = {
  draft: ['sent', 'cancelled'],
  sent: ['confirmed', 'cancelled'],
  confirmed: ['cancelled'],
  partially_received: ['cancelled'],
  received: [],
  cancelled: [],
}
/** Cancelling a PO now requires a reason, same as orders/quotations/
 * feasibility -- previously the only module missing this. */
export const PURCHASE_ORDER_STATUSES_REQUIRING_REASON: SettablePurchaseOrderStatus[] = ['cancelled']

/** Mirrors ALLOWED_TRANSITIONS in backend/app/models/delivery_note.py.
 * 'issued' is terminal on purpose -- it drives the linked order to
 * 'shipped', a real inventory/order change that shouldn't be reversible
 * from here (cancel the order itself instead). */
export const DELIVERY_NOTE_TRANSITIONS: Record<DeliveryNoteStatus, SettableDeliveryNoteStatus[]> = {
  draft: ['issued', 'cancelled'],
  issued: [],
  cancelled: [],
}
/** Cancelling a delivery note now requires a reason, same as orders/
 * quotations/feasibility -- previously the only module missing this. */
export const DELIVERY_NOTE_STATUSES_REQUIRING_REASON: SettableDeliveryNoteStatus[] = ['cancelled']
