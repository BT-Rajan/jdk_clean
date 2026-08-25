import { z } from 'zod'

// "tag1, tag2" -> ["tag1", "tag2"]; blank -> undefined (cleared).
function parseTags(v: string | undefined): string[] | undefined {
  if (!v || !v.trim()) return undefined
  return v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

// One "key: value" pair per line -> {key: value}; blank -> undefined.
function parseProperties(v: string | undefined): Record<string, string> | undefined {
  if (!v || !v.trim()) return undefined
  const entries = v
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const idx = line.indexOf(':')
      return idx === -1 ? [line, ''] : [line.slice(0, idx).trim(), line.slice(idx + 1).trim()]
    })
    .filter(([key]) => key)
  return entries.length ? Object.fromEntries(entries) : undefined
}

// Displays tags/properties back into the form's raw text fields when
// loading an existing product for editing.
export function tagsToInput(tags: string[] | null | undefined): string {
  return tags?.join(', ') ?? ''
}

export function propertiesToInput(properties: Record<string, string> | null | undefined): string {
  return properties ? Object.entries(properties).map(([k, v]) => `${k}: ${v}`).join('\n') : ''
}

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
  tags: z.string().optional().transform(parseTags),
  properties: z.string().optional().transform(parseProperties),
  reorder_point: z.coerce.number().min(0, 'Must be 0 or more').optional().or(z.literal('').transform(() => undefined)),
})

export type ProductFormValues = z.input<typeof productSchema>
export type ProductSubmitValues = z.output<typeof productSchema>

// ProductOut round-trips every Update field, so the edit form only drops
// the immutable `code`.
export const productEditSchema = productSchema.omit({ code: true })

export type ProductEditFormValues = z.input<typeof productEditSchema>
export type ProductEditSubmitValues = z.output<typeof productEditSchema>
