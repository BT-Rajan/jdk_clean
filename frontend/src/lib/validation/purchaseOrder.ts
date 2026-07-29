import { z } from 'zod'

// Mirrors backend/app/schemas/purchase_order.py.
export const purchaseOrderLineSchema = z.object({
  raw_material_id: z.coerce.number().int().positive('Choose a raw material'),
  quantity: z.coerce.number().positive('Must be greater than 0'),
  unit_price: z.coerce.number().min(0, 'Must be 0 or more'),
})

export const purchaseOrderSchema = z.object({
  supplier_id: z.coerce.number().int().positive('Choose a supplier'),
  order_date: z.string().min(1, 'Date is required'),
  expected_delivery_date: z.string().optional().or(z.literal('')),
  notes: z.string().trim().optional().or(z.literal('')),
  lines: z.array(purchaseOrderLineSchema).min(1, 'At least one line item is required'),
})

export type PurchaseOrderFormValues = z.input<typeof purchaseOrderSchema>
export type PurchaseOrderSubmitValues = z.output<typeof purchaseOrderSchema>
