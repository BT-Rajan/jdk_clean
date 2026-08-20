import { z } from 'zod'

// Mirrors backend/app/schemas/product.py.
export const productSchema = z.object({
  code: z.string().trim().min(1, 'Code is required').max(30),
  name: z.string().trim().min(1, 'Name is required').max(150),
  unit: z.string().trim().min(1, 'Unit is required').max(20),
  product_type: z.enum(['finished_good', 'sub_assembly']),
  selling_price: z.coerce.number().min(0, 'Must be 0 or more'),
  batch_size: z.coerce.number().positive('Must be greater than 0').optional().or(z.literal('').transform(() => undefined)),
  batch_production_hours: z.coerce.number().min(0, 'Must be 0 or more').optional().or(z.literal('').transform(() => undefined)),
  machine_id: z.coerce.number().int().positive().optional().or(z.literal('').transform(() => undefined)),
  production_hours_per_unit: z.coerce.number().min(0, 'Must be 0 or more').optional().or(z.literal('').transform(() => undefined)),
  workers_required: z.coerce.number().int().min(0, 'Must be 0 or more').optional().or(z.literal('').transform(() => undefined)),
  status: z.enum(['active', 'inactive']),
})

export type ProductFormValues = z.input<typeof productSchema>
export type ProductSubmitValues = z.output<typeof productSchema>

// ProductOut round-trips every Update field, so the edit form only drops
// the immutable `code`.
export const productEditSchema = productSchema.omit({ code: true })

export type ProductEditFormValues = z.input<typeof productEditSchema>
export type ProductEditSubmitValues = z.output<typeof productEditSchema>
