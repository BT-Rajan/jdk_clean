/** Mirrors backend/app/schemas/payment.py. There's no online payment
 * collection yet -- a Payment is a manual record of money that arrived
 * outside the app (bank transfer, cheque, cash), entered once someone's
 * confirmed it actually landed. */
export interface Payment {
  id: number
  order_id: number
  order_number: string | null
  customer_id: number
  customer_name: string | null
  amount: number
  payment_date: string
  method: string | null
  reference: string | null
  notes: string | null
  created_at: string
  recorded_by_name: string | null
  /** Finance confirming the money actually landed -- distinct from
   * recorded_by_name, who merely logged the claim. Only acknowledged
   * payments count toward the outstanding balance that gates production
   * start for a non-credit order or a payment plan's completion. */
  acknowledged_at: string | null
  acknowledged_by_name: string | null
}

export interface PaymentPayload {
  amount: number
  payment_date: string
  method?: string | null
  reference?: string | null
  notes?: string | null
}

export interface CustomerCreditStatus {
  customer_id: number
  credit_limit: number
  /** false when credit_limit is 0 -- nobody's set a limit for this
   * customer, so it's not enforced (see order_service.change_status). */
  limit_enforced: boolean
  outstanding_balance: number
  available_credit: number | null
  /** See CustomerDetailPage's credit warning and order_service.
   * change_status -- confirming an order that relies on credit is
   * blocked until this is true. */
  id_verified: boolean
}

/** Mirrors backend payment_service.get_order_payment_status -- the
 * single source the order detail page and the collection queue both
 * read from. */
export interface OrderPaymentStatus {
  order_id: number
  total_amount: number
  amount_paid: number
  amount_acknowledged: number
  outstanding_balance: number
  /** Automatically derived from the customer's payment terms. */
  due_date: string
  overdue_days: number
  has_credit_facility: boolean
  /** None if production may start right now; otherwise why not -- see
   * payment_service.get_production_payment_block_reason. */
  production_block_reason: string | null
  payment_override_at: string | null
  payment_override_reason: string | null
  payment_followup_owner_id: number | null
  payment_followup_owner_name: string | null
  payment_followup_date: string | null
}

export interface CollectionQueueRow extends OrderPaymentStatus {
  order_number: string
  customer_id: number
  customer_name: string
}

export interface PaymentOverridePayload {
  reason: string
}

export interface PaymentFollowupPayload {
  owner_id: number | null
  followup_date: string | null
}
