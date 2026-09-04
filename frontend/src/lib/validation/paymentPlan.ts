import { z } from 'zod'
import { NOT_PAST_DATE_MESSAGE, isNotPastDate } from './dateRules'

// Mirrors backend/app/schemas/payment_plan.py.
export const paymentPlanSchema = z.object({
  amount: z.coerce.number().positive('Must be greater than 0'),
  target_date: z.string().min(1, 'Date is required').refine(isNotPastDate, { message: NOT_PAST_DATE_MESSAGE }),
  notes: z.string().trim().optional().or(z.literal('')),
})

export type PaymentPlanFormValues = z.input<typeof paymentPlanSchema>
export type PaymentPlanSubmitValues = z.output<typeof paymentPlanSchema>
