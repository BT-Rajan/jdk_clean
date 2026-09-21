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
  /** Client ID, primary contact and mobile -- a read-only projection of
   * the Client Master, for the order detail page's client-info block. */
  customer_number: string | null
  customer_contact_person: string | null
  customer_phone: string | null
  deal_id: number | null
  deal_number: string | null
  /** The quotation this order was converted from, if any -- only
   * populated on GET (list and detail), null on write responses. */
  quotation_number: string | null
  order_date: string
  requested_delivery_date: string | null
  confirmed_delivery_date: string | null
  status: OrderStatus
  subtotal_amount: number
  discount_percent: number
  discount_amount: number
  total_amount: number
  notes: string | null
  close_reason: string | null
  /** Copied from the source quotation at conversion time -- see
   * Quotation.payment_link. Printed as a QR code on this order's PDF. */
  payment_link: string | null
  /** Set the moment this order first reaches 'confirmed'. */
  confirmed_at: string | null
  /** Set once an admin has approved a large discount on this order
   * (Settings -> large_discount_approval_threshold). Null if never
   * required or not yet approved. */
  approved_at: string | null
  admin_review_required: boolean
  /** 'overdue_delivery' or 'payment_overdue' -- null whenever
   * admin_review_required is false. */
  admin_review_reason: 'overdue_delivery' | 'payment_overdue' | null
  admin_reviewed_at: string | null
  admin_review_notes: string | null
  /** Last time a payment-request email went out for this order (see
   * POST /{id}/request-payment). Purely informational. */
  payment_requested_at: string | null
  /** Set the moment the automatic order-confirmation email successfully
   * sent (fires once, the first time the order reaches 'confirmed').
   * Null if the customer has no email on file or the send failed. */
  confirmation_emailed_at: string | null
  /** Finance's own worklist entry for chasing this order's balance --
   * see POST /{id}/payments/followup. Both null until set. */
  payment_followup_owner_id: number | null
  payment_followup_owner_name: string | null
  payment_followup_date: string | null
  /** Set when Finance lets a non-credit order into production despite
   * an acknowledged shortfall -- see POST /{id}/payments/override. */
  payment_override_at: string | null
  payment_override_by: number | null
  payment_override_reason: string | null
  /** Set when this order is itself a child born out of splitting a
   * 'ready_to_ship' order that stock couldn't fully cover (see
   * POST /{id}/split). */
  parent_order_id: number | null
  parent_order_number: string | null
  /** Populated the other direction on the parent: every order split off
   * of this one. */
  child_orders: OrderChildSummary[]
  lines: OrderLine[]
  /** A single "what to do next" sentence derived from this order's
   * current status and its real production/delivery/payment state --
   * only populated on the detail and status-change responses (null on
   * list rows). See order_service.get_next_action. */
  next_action: string | null
  /** Only set on the response to the status-change call that just
   * cancelled this order -- what got taken down with it. */
  cancellation_effects: OrderCancellationEffects | null
  created_at: string
  updated_at: string
}

export interface CancelledProductionBatchSummary {
  id: number
  batch_number: string
  status: string
}

export interface ReleasedReservationSummary {
  product_id: number
  product_name: string | null
  quantity: number
}

export interface CancelledDeliveryNoteSummary {
  id: number
  delivery_note_number: string
}

export interface OrderCancellationEffects {
  cancelled_production_batches: CancelledProductionBatchSummary[]
  released_reservations: ReleasedReservationSummary[]
  cancelled_delivery_notes: CancelledDeliveryNoteSummary[]
}

export interface OrderChildSummary {
  id: number
  order_number: string
  status: OrderStatus
  total_amount: number
}

export interface SplitOrderLineInput {
  order_detail_id: number
  quantity: number
}

export interface OrderPayload {
  customer_id: number
  order_date: string
  requested_delivery_date?: string | null
  notes?: string | null
  discount_percent?: number
  lines: OrderLineInput[]
}

export type SettableOrderStatus = Exclude<OrderStatus, 'draft'>

/** P8: per order line, how much is ordered/delivered/outstanding set
 * against what's actually released FG stock right now, plus existing
 * planned/in-progress production for the same product. Mirrors
 * backend/app/schemas/order.py's OrderFulfillmentLineOut. */
export interface OrderFulfillmentLine {
  order_detail_id: number
  product_id: number
  product_code: string | null
  product_name: string | null
  unit: string | null
  ordered_quantity: number
  delivered_quantity: number
  remaining_quantity: number
  available_fg: number
  fulfillable_now: number
  /** What released FG stock covers for this order right now (== fulfillable_now). */
  allocated_quantity: number
  /** This order line's own production output (completed executions). */
  produced_quantity: number
  released_quantity: number
  rejected_quantity: number
  /** Produced but not yet released or rejected by QC. */
  qc_pending_quantity: number
  shortage: number
  planned_production_quantity: number
  in_progress_production_quantity: number
}
