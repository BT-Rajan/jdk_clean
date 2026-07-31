import { z } from 'zod'
import { NOT_PAST_DATE_MESSAGE, isNotPastDate } from './dateRules'

// Mirrors backend/app/schemas/purchase_order.py.
export const purchaseOrderLineSchema = z.object({
  raw_material_id: z.coerce.number().int().positive('Choose a raw material'),
  quantity: z.coerce.number().positive('Must be greater than 0'),
  unit_price: z.coerce.number().min(0, 'Must be 0 or more'),
})

export const purchaseOrderSchema = z.object({
  supplier_id: z.coerce.number().int().positive('Choose a supplier'),
  order_date: z.string().min(1, 'Date is required').refine(isNotPastDate, { message: NOT_PAST_DATE_MESSAGE }),
  expected_delivery_date: z.string().optional().or(z.literal('')).refine(isNotPastDate, { message: NOT_PAST_DATE_MESSAGE }),
  notes: z.string().trim().optional().or(z.literal('')),
  lines: z.array(purchaseOrderLineSchema).min(1, 'At least one line item is required'),
})

export type PurchaseOrderFormValues = z.input<typeof purchaseOrderSchema>
export type PurchaseOrderSubmitValues = z.output<typeof purchaseOrderSchema>

export const purchaseOrderAdminReviewSchema = z.object({
  notes: z.string().trim().min(1, 'Notes are required.'),
})
export type PurchaseOrderAdminReviewFormValues = z.infer<typeof purchaseOrderAdminReviewSchema>
