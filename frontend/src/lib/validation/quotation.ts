import { z } from 'zod'
import { NOT_PAST_DATE_MESSAGE, isNotPastDate } from './dateRules'

// Mirrors backend/app/schemas/quotation.py.
export const quotationLineSchema = z.object({
  product_id: z.coerce.number().int().positive('Choose a product'),
  quantity: z.coerce.number().positive('Must be greater than 0'),
  unit_price: z.coerce.number().min(0, 'Must be 0 or more'),
  discount_percent: z.coerce.number().min(0).max(100).optional().or(z.literal('').transform(() => undefined)),
})

export const quotationSchema = z.object({
  customer_id: z.coerce.number().int().positive('Choose a customer'),
  feasibility_id: z.coerce.number().int().optional().or(z.literal('').transform(() => undefined)),
  quotation_date: z.string().min(1, 'Date is required').refine(isNotPastDate, { message: NOT_PAST_DATE_MESSAGE }),
  // The empty-string branch goes FIRST and transforms to undefined --
  // z.union (what .or() builds) returns whichever alternative matches
  // first, and a bare z.string() already accepts '' as a valid (if
  // empty) string, so putting .literal('') second would never even be
  // reached. Getting this backwards means a blank date field submits as
  // the literal string '', which the backend's `date | None` field
  // rejects outright (a genuinely optional field left blank should send
  // nothing at all, not an unparseable date).
  valid_until: z.literal('').transform(() => undefined).or(z.string()).optional().refine(isNotPastDate, { message: NOT_PAST_DATE_MESSAGE }),
  notes: z.string().trim().optional().or(z.literal('')),
  // Percentage, e.g. 0 or 10 -- a whole-document discount on top of the
  // already line-discounted subtotal.
  discount_percent: z.coerce.number().min(0).max(100).optional().or(z.literal('').transform(() => undefined)),
  lines: z.array(quotationLineSchema).min(1, 'At least one line item is required'),
  // Which admin-uploaded template (English/Arabic) this quotation is
  // raised in -- drives the default language Print/Email use.
  language: z.enum(['en', 'ar']).default('en'),
})

export type QuotationFormValues = z.input<typeof quotationSchema>
export type QuotationSubmitValues = z.output<typeof quotationSchema>

// 'converted' is set only by convert-to-order, never chosen directly.
export const quotationStatusSchema = z.object({
  status: z.enum(['sent', 'accepted', 'rejected', 'expired']),
})

export type QuotationStatusFormValues = z.infer<typeof quotationStatusSchema>
