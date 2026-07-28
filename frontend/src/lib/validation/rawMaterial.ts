import { z } from 'zod'

// Mirrors backend/app/schemas/raw_material.py.
export const rawMaterialSchema = z.object({
  code: z.string().trim().min(1, 'Code is required').max(30),
  name: z.string().trim().min(1, 'Name is required').max(150),
  unit: z.string().trim().min(1, 'Unit is required').max(20),
  reorder_point: z.coerce.number().min(0, 'Must be 0 or more'),
  default_supplier_id: z.coerce.number().int().positive().optional().or(z.literal('')),
  unit_cost: z.coerce.number().min(0, 'Must be 0 or more'),
  status: z.enum(['active', 'inactive']),
})

export type RawMaterialFormValues = z.input<typeof rawMaterialSchema>
export type RawMaterialSubmitValues = z.output<typeof rawMaterialSchema>

// RawMaterialOut round-trips every Update field, so the edit form only
// drops the immutable `code`.
export const rawMaterialEditSchema = rawMaterialSchema.omit({ code: true })

export type RawMaterialEditFormValues = z.input<typeof rawMaterialEditSchema>
export type RawMaterialEditSubmitValues = z.output<typeof rawMaterialEditSchema>
