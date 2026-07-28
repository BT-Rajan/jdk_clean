import { z } from 'zod'

// Mirrors backend/app/schemas/supplier.py SupplierCreate/SupplierUpdate.
export const supplierSchema = z.object({
  code: z.string().trim().min(1, 'Code is required').max(30),
  name: z.string().trim().min(1, 'Name is required').max(150),
  contact_person: z.string().trim().optional().or(z.literal('')),
  email: z.string().trim().email('Enter a valid email').optional().or(z.literal('')),
  phone: z.string().trim().optional().or(z.literal('')),
  address: z.string().trim().optional().or(z.literal('')),
  city: z.string().trim().optional().or(z.literal('')),
  country: z.string().trim().optional().or(z.literal('')),
  tax_id: z.string().trim().optional().or(z.literal('')),
  payment_terms_days: z.coerce.number().int().min(0, 'Must be 0 or more'),
  mode_of_supply: z.enum(['direct', 'distributor', 'broker', 'import']).optional().or(z.literal('')),
  rating: z.coerce.number().int().min(1).max(5).optional().or(z.literal('')),
  status: z.enum(['active', 'inactive', 'suspended']),
})

export type SupplierFormValues = z.input<typeof supplierSchema>
export type SupplierSubmitValues = z.output<typeof supplierSchema>

/** Edit form only: SupplierOut doesn't return address or tax_id, so those
 * are create-only fields -- see types/supplier.ts. */
export const supplierEditSchema = supplierSchema.omit({
  code: true,
  address: true,
  tax_id: true,
})

export type SupplierEditFormValues = z.input<typeof supplierEditSchema>
export type SupplierEditSubmitValues = z.output<typeof supplierEditSchema>
