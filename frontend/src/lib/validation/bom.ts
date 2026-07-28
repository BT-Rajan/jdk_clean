import { z } from 'zod'

// Mirrors backend/app/schemas/bom.py BomLineIn. Duplicate-component
// checking happens server-side (see BomReplace._no_duplicate_components);
// the form still checks client-side for immediate feedback.
export const bomLineSchema = z.object({
  component_type: z.enum(['raw_material', 'product']),
  component_id: z.coerce.number().int().positive('Choose a component'),
  quantity: z.coerce.number().positive('Must be greater than 0'),
  unit: z.string().trim().min(1, 'Unit is required').max(20),
  scrap_percent: z.coerce.number().min(0).max(100),
})

export type BomLineFormValues = z.input<typeof bomLineSchema>
export type BomLineSubmitValues = z.output<typeof bomLineSchema>

export const bomExplodeSchema = z.object({
  quantity: z.coerce.number().positive('Must be greater than 0'),
})

export type BomExplodeFormValues = z.input<typeof bomExplodeSchema>
export type BomExplodeSubmitValues = z.output<typeof bomExplodeSchema>
