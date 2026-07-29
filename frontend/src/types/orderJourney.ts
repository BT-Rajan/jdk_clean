/** Mirrors backend/app/schemas/order_journey.py. */

export interface JourneyFeasibility {
  id: number
  feasibility_number: string
  status: string
  required_by_date: string | null
  created_at: string
  checked_at: string | null
}

export interface JourneyQuotation {
  id: number
  quotation_number: string
  status: string
  quotation_date: string
  total_amount: number
  created_at: string
}

export interface JourneyOrder {
  id: number
  order_number: string
  status: string
  order_date: string
  requested_delivery_date: string | null
  confirmed_delivery_date: string | null
  total_amount: number
  customer_name: string | null
  admin_review_required: boolean
  created_at: string
}

export interface JourneyProductionBatch {
  id: number
  batch_number: string
  status: string
  product_name: string | null
  machine_name: string | null
  planned_quantity: number
  produced_quantity: number
  scheduled_start: string
  scheduled_end: string
  created_at: string
  actual_start: string | null
  actual_end: string | null
}

export interface JourneyDeliveryNote {
  id: number
  delivery_note_number: string
  status: string
  delivery_date: string
  created_at: string
}

export interface OrderJourney {
  order: JourneyOrder
  feasibility: JourneyFeasibility | null
  quotation: JourneyQuotation | null
  production_batches: JourneyProductionBatch[]
  delivery_notes: JourneyDeliveryNote[]
}
