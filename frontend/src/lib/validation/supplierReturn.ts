import { z } from 'zod'
import { NOT_FUTURE_DATE_MESSAGE, isNotFutureDate } from './dateRules'

// Mirrors backend/app/schemas/supplier_return.py.
export const supplierReturnLineSchema = z.object({
  raw_material_id: z.coerce.number().int().positive('Choose a raw material'),
  quantity: z.coerce.number().positive('Must be greater than 0'),
})

export const supplierReturnSchema = z.object({
  supplier_id: z.coerce.number().int().positive('Choose a supplier'),
  purchase_order_id: z.coerce.number().int().positive().optional().or(z.literal('').transform(() => undefined)),
  return_date: z.string().min(1, 'Date is required').refine(isNotFutureDate, { message: NOT_FUTURE_DATE_MESSAGE }),
  reason: z.string().trim().min(1, 'Reason is required -- what was wrong with it?'),
  notes: z.string().trim().optional().or(z.literal('')),
  lines: z.array(supplierReturnLineSchema).min(1, 'At least one line item is required'),
})

export type SupplierReturnFormValues = z.input<typeof supplierReturnSchema>
export type SupplierReturnSubmitValues = z.output<typeof supplierReturnSchema>
