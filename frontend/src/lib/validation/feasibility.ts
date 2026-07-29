import { z } from 'zod'
import { NOT_PAST_DATE_MESSAGE, isNotPastDate } from './dateRules'

// Mirrors backend/app/schemas/feasibility.py.
export const feasibilityLineSchema = z.object({
  product_id: z.coerce.number().int().positive('Choose a product'),
  quantity: z.coerce.number().positive('Must be greater than 0'),
})

export const feasibilitySchema = z.object({
  customer_id: z.coerce.number().int().positive('Choose a customer'),
  required_by_date: z.string().optional().or(z.literal('')).refine(isNotPastDate, { message: NOT_PAST_DATE_MESSAGE }),
  notes: z.string().trim().optional().or(z.literal('')),
  lines: z.array(feasibilityLineSchema).min(1, 'At least one product line is required'),
})

export type FeasibilityFormValues = z.input<typeof feasibilitySchema>
export type FeasibilitySubmitValues = z.output<typeof feasibilitySchema>

export const feasibilityExceptionSchema = z.object({
  reason: z.string().trim().min(1, 'A comment is required to override this result.'),
})
export type FeasibilityExceptionFormValues = z.infer<typeof feasibilityExceptionSchema>

export const feasibilityCloseSchema = z.object({
  reason: z.string().trim().min(1, 'A reason is required to close this check.'),
})
export type FeasibilityCloseFormValues = z.infer<typeof feasibilityCloseSchema>

export const feasibilityAdminReviewSchema = z.object({
  notes: z.string().trim().min(1, 'Notes are required.'),
})
export type FeasibilityAdminReviewFormValues = z.infer<typeof feasibilityAdminReviewSchema>
