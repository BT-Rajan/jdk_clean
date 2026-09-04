import { z } from 'zod'

// Mirrors backend/app/schemas/supplier.py SupplierCreate/SupplierUpdate.
// code is deliberately absent -- it's auto-generated server-side, never
// collected in the wizard.
export const supplierSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(150),
  contact_person: z.string().trim().max(120, 'Max 120 characters').optional().or(z.literal('')),
  email: z.string().trim().email('Enter a valid email').max(120, 'Max 120 characters').optional().or(z.literal('')),
  phone: z.string().trim().max(30, 'Max 30 characters').optional().or(z.literal('')),
  address: z.string().trim().max(255, 'Max 255 characters').optional().or(z.literal('')),
  city: z.string().trim().max(80, 'Max 80 characters').optional().or(z.literal('')),
  country: z.string().trim().max(80, 'Max 80 characters').optional().or(z.literal('')),
  payment_terms_days: z.coerce.number().int().min(0, 'Must be 0 or more'),
  mode_of_supply: z.enum(['direct', 'distributor', 'broker', 'import']).optional().or(z.literal('')),
  rating: z.coerce.number().int().min(1).max(5).optional().or(z.literal('')),
  status: z.enum(['active', 'inactive', 'suspended']),
})

export type SupplierFormValues = z.input<typeof supplierSchema>
export type SupplierSubmitValues = z.output<typeof supplierSchema>

/** Edit form only: SupplierOut doesn't return address, so it's a
 * create-only field -- see types/supplier.ts. */
export const supplierEditSchema = supplierSchema.omit({
  address: true,
})

export type SupplierEditFormValues = z.input<typeof supplierEditSchema>
export type SupplierEditSubmitValues = z.output<typeof supplierEditSchema>
