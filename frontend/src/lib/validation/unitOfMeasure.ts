import { z } from 'zod'

// Mirrors backend/app/schemas/unit_of_measure.py.
export const unitOfMeasureSchema = z.object({
  code: z.string().trim().min(1, 'Code is required').max(20),
  name: z.string().trim().min(1, 'Name is required').max(60),
  category: z.enum(['weight', 'count', 'volume']),
  factor_to_base: z.coerce.number().positive('Must be greater than 0'),
  is_base: z.boolean(),
  status: z.enum(['active', 'inactive']),
})

export type UnitOfMeasureFormValues = z.input<typeof unitOfMeasureSchema>
export type UnitOfMeasureSubmitValues = z.output<typeof unitOfMeasureSchema>

// code and category are immutable once created (see backend schema).
export const unitOfMeasureEditSchema = unitOfMeasureSchema.omit({ code: true, category: true })

export type UnitOfMeasureEditFormValues = z.input<typeof unitOfMeasureEditSchema>
export type UnitOfMeasureEditSubmitValues = z.output<typeof unitOfMeasureEditSchema>
