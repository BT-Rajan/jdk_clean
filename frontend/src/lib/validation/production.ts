import { z } from 'zod'

// Mirrors backend/app/schemas/production_schedule.py.
export const productionBatchSchema = z
  .object({
    product_id: z.coerce.number().int().positive('Choose a product'),
    order_id: z.coerce.number().int().positive().optional().or(z.literal('')),
    planned_quantity: z.coerce.number().positive('Must be greater than 0'),
    scheduled_start: z.string().min(1, 'Date is required'),
    scheduled_end: z.string().min(1, 'Date is required'),
    notes: z.string().trim().optional().or(z.literal('')),
  })
  .refine((v) => v.scheduled_end >= v.scheduled_start, {
    message: 'End date cannot be before the start date',
    path: ['scheduled_end'],
  })

export type ProductionBatchFormValues = z.input<typeof productionBatchSchema>
export type ProductionBatchSubmitValues = z.output<typeof productionBatchSchema>

export const productionCompleteSchema = z.object({
  produced_quantity: z.coerce.number().positive('Must be greater than 0'),
})

export type ProductionCompleteFormValues = z.infer<typeof productionCompleteSchema>
