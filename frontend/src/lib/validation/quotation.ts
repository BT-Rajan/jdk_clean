import { z } from 'zod'

// Mirrors backend/app/schemas/quotation.py.
export const quotationLineSchema = z.object({
  product_id: z.coerce.number().int().positive('Choose a product'),
  quantity: z.coerce.number().positive('Must be greater than 0'),
  unit_price: z.coerce.number().min(0, 'Must be 0 or more'),
})

export const quotationSchema = z.object({
  customer_id: z.coerce.number().int().positive('Choose a customer'),
  feasibility_id: z.coerce.number().int().optional().or(z.literal('').transform(() => undefined)),
  quotation_date: z.string().min(1, 'Date is required'),
  valid_until: z.string().optional().or(z.literal('')),
  notes: z.string().trim().optional().or(z.literal('')),
  lines: z.array(quotationLineSchema).min(1, 'At least one line item is required'),
})

export type QuotationFormValues = z.input<typeof quotationSchema>
export type QuotationSubmitValues = z.output<typeof quotationSchema>

// 'converted' is set only by convert-to-order, never chosen directly.
export const quotationStatusSchema = z.object({
  status: z.enum(['sent', 'accepted', 'rejected', 'expired']),
})

export type QuotationStatusFormValues = z.infer<typeof quotationStatusSchema>
