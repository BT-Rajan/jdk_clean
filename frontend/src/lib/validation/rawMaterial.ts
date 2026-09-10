import { z } from 'zod'
import { parseProperties } from './product'

// Raw materials use the identical free-form JSON spec approach as
// products (see backend/app/models/raw_material.py `properties`) --
// parseProperties is shared from lib/validation/product.ts rather than
// duplicated here. propertiesToInput is already re-exported from there
// via this directory's barrel (./index.ts); import it from '@/lib/
// validation/product' or '@/lib/validation' directly, not from here.

// Mirrors backend/app/schemas/raw_material.py.
export const rawMaterialSchema = z
  .object({
    code: z.string().trim().min(1, 'Code is required').max(30),
    name: z.string().trim().min(1, 'Name is required').max(150),
    unit: z.string().trim().min(1, 'Unit is required').max(20),
    material_type: z.enum(['raw_material', 'packaging', 'consumable']),
    category: z.string().trim().max(100).optional().or(z.literal('').transform(() => undefined)),
    description: z.string().optional().or(z.literal('').transform(() => undefined)),
    properties: z.string().optional().transform(parseProperties),
    manufacturer: z.string().trim().max(150).optional().or(z.literal('').transform(() => undefined)),
    manufacturer_part_number: z.string().trim().max(100).optional().or(z.literal('').transform(() => undefined)),

    reorder_point: z.coerce.number().min(0, 'Must be 0 or more'),
    safety_stock: z.coerce.number().min(0, 'Must be 0 or more'),
    maximum_stock: z.coerce.number().min(0, 'Must be 0 or more'),
    storage_location: z.string().trim().max(100).optional().or(z.literal('').transform(() => undefined)),

    default_supplier_id: z.coerce.number().int().positive().optional().or(z.literal('')),
    unit_cost: z.coerce.number().min(0, 'Must be 0 or more'),

    inspection_required: z.boolean(),
    certificate_required: z.boolean(),
    qc_notes: z.string().optional().or(z.literal('').transform(() => undefined)),

    status: z.enum(['active', 'inactive', 'blocked']),
  })
  .refine((v) => v.maximum_stock <= 0 || v.safety_stock <= v.maximum_stock, {
    message: 'Safety stock cannot exceed maximum stock.',
    path: ['safety_stock'],
  })
  .refine((v) => v.maximum_stock <= 0 || v.reorder_point <= v.maximum_stock, {
    message: 'Reorder point cannot exceed maximum stock.',
    path: ['reorder_point'],
  })

export type RawMaterialFormValues = z.input<typeof rawMaterialSchema>
export type RawMaterialSubmitValues = z.output<typeof rawMaterialSchema>

// RawMaterialOut round-trips every Update field, so the edit form only
// drops the immutable `code`.
export const rawMaterialEditSchema = rawMaterialSchema.omit({ code: true })

export type RawMaterialEditFormValues = z.input<typeof rawMaterialEditSchema>
export type RawMaterialEditSubmitValues = z.output<typeof rawMaterialEditSchema>
