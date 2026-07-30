/** Mirrors backend/app/schemas/delivery_note.py. */

export type DeliveryNoteStatus = 'draft' | 'issued' | 'cancelled'

export interface DeliveryNoteLine {
  id: number
  product_id: number
  product_code: string | null
  product_name: string | null
  unit: string | null
  quantity_delivered: number
}

export interface DeliveryNote {
  id: number
  delivery_note_number: string
  order_id: number
  order_number: string | null
  customer_name: string | null
  customer_email: string | null
  delivery_date: string
  status: DeliveryNoteStatus
  /** True when the system drafted this automatically once the order
   * became ready to ship, rather than a person creating it. */
  auto_created: boolean
  notes: string | null
  lines: DeliveryNoteLine[]
  created_at: string
  updated_at: string
}

export interface DeliveryNoteLineInput {
  product_id: number
  quantity_delivered: number
}

export interface DeliveryNoteCreatePayload {
  order_id: number
  delivery_date: string
  notes?: string | null
  /** Omit to auto-populate from the order's own lines (see
   * delivery_note_service.create_delivery_note). */
  lines?: DeliveryNoteLineInput[]
}

export interface DeliveryNoteUpdatePayload {
  delivery_date?: string
  notes?: string | null
  lines?: DeliveryNoteLineInput[]
}

/** 'draft' is only set at creation, never via the plain status endpoint. */
export type SettableDeliveryNoteStatus = 'issued' | 'cancelled'
