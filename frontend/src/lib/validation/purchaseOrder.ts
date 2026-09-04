import { z } from 'zod'
import { NOT_PAST_DATE_MESSAGE, isNotPastDate } from './dateRules'

// Mirrors backend/app/schemas/purchase_order.py.
export const purchaseOrderLineSchema = z.object({
  raw_material_id: z.coerce.number().int().positive('Choose a raw material'),
  quantity: z.coerce.number().positive('Must be greater than 0'),
  unit_price: z.coerce.number().min(0, 'Must be 0 or more'),
  discount_percent: z.coerce.number().min(0).max(100).optional().or(z.literal('').transform(() => undefined)),
})

export const purchaseOrderSchema = z.object({
  supplier_id: z.coerce.number().int().positive('Choose a supplier'),
  order_date: z.string().min(1, 'Date is required').refine(isNotPastDate, { message: NOT_PAST_DATE_MESSAGE }),
  // The empty-string branch goes FIRST and transforms to undefined --
  // see quotation.ts's valid_until for why the reverse order silently
  // never applies the transform at all (z.string() already accepts '').
  expected_delivery_date: z.literal('').transform(() => undefined).or(z.string()).optional().refine(isNotPastDate, { message: NOT_PAST_DATE_MESSAGE }),
  notes: z.string().trim().optional().or(z.literal('')),
  discount_percent: z.coerce.number().min(0).max(100).optional().or(z.literal('').transform(() => undefined)),
  lines: z.array(purchaseOrderLineSchema).min(1, 'At least one line item is required'),
})

export type PurchaseOrderFormValues = z.input<typeof purchaseOrderSchema>
export type PurchaseOrderSubmitValues = z.output<typeof purchaseOrderSchema>

export const purchaseOrderAdminReviewSchema = z.object({
  notes: z.string().trim().min(1, 'Notes are required.'),
})
export type PurchaseOrderAdminReviewFormValues = z.infer<typeof purchaseOrderAdminReviewSchema>
