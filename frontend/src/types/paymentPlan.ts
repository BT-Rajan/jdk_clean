/** Mirrors backend/app/schemas/payment_plan.py. A recorded commitment to
 * pay an order off by some date -- purely informational, does NOT feed
 * the credit-limit check the way a real Payment does (see
 * order_service.change_status). Deliberately just one commitment record
 * (amount + a single target date) for now, not a per-installment
 * schedule. */
export interface PaymentPlan {
  id: number
  order_id: number
  order_number: string | null
  customer_id: number
  customer_name: string | null
  amount: number
  target_date: string
  notes: string | null
  created_at: string
  recorded_by_name: string | null
}

export interface PaymentPlanPayload {
  amount: number
  target_date: string
  notes?: string | null
}
