/** Mirrors backend/app/schemas/deal_detail.py. */

export interface DealFeasibilityRef {
  id: number
  feasibility_number: string
  status: string
}

export interface DealQuotationRef {
  id: number
  quotation_number: string
  status: string
  total_amount: number
  auto_created: boolean
}

export interface DealOrderRef {
  id: number
  order_number: string
  status: string
  total_amount: number
}

export interface DealBatchRef {
  id: number
  batch_number: string
  status: string
  product_name: string | null
}

export interface DealDeliveryRef {
  id: number
  delivery_note_number: string
  status: string
}

export interface DealDetail {
  id: number
  deal_number: string
  customer_id: number
  customer_name: string | null
  furthest_stage: string
  created_at: string
  feasibility_checks: DealFeasibilityRef[]
  quotations: DealQuotationRef[]
  orders: DealOrderRef[]
  production_batches: DealBatchRef[]
  delivery_notes: DealDeliveryRef[]
}
