import { z } from 'zod'
import { NOT_FUTURE_DATE_MESSAGE, isNotFutureDate } from './dateRules'

// Mirrors backend/app/schemas/payment.py.
export const paymentSchema = z.object({
  amount: z.coerce.number().positive('Must be greater than 0'),
  payment_date: z.string().min(1, 'Date is required').refine(isNotFutureDate, { message: NOT_FUTURE_DATE_MESSAGE }),
  method: z.string().trim().optional().or(z.literal('')),
  reference: z.string().trim().optional().or(z.literal('')),
  notes: z.string().trim().optional().or(z.literal('')),
})

export type PaymentFormValues = z.input<typeof paymentSchema>
export type PaymentSubmitValues = z.output<typeof paymentSchema>
