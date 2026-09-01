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
}
