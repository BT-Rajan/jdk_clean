import { z } from 'zod'

// Mirrors backend/app/schemas/customer.py CustomerCreate/CustomerUpdate.
export const customerSchema = z.object({
  code: z.string().trim().min(1, 'Code is required').max(30),
  name: z.string().trim().min(1, 'Name is required').max(150),
  contact_person: z.string().trim().optional().or(z.literal('')),
  email: z.string().trim().email('Enter a valid email').optional().or(z.literal('')),
  phone: z.string().trim().optional().or(z.literal('')),
  billing_address: z.string().trim().optional().or(z.literal('')),
  shipping_address: z.string().trim().optional().or(z.literal('')),
  city: z.string().trim().optional().or(z.literal('')),
  country: z.string().trim().optional().or(z.literal('')),
  credit_limit: z.coerce.number().min(0, 'Must be 0 or more'),
  payment_terms_days: z.coerce.number().int().min(0, 'Must be 0 or more'),
  status: z.enum(['active', 'inactive']),
  notes: z.string().trim().optional().or(z.literal('')),
})

export type CustomerFormValues = z.input<typeof customerSchema>
export type CustomerSubmitValues = z.output<typeof customerSchema>

/** Edit form only: CustomerOut doesn't return billing_address,
 * shipping_address, or notes, so those are create-only fields --
 * see types/customer.ts. Editing re-submits everything CustomerOut did
 * return, plus the fields the user can change. */
export const customerEditSchema = customerSchema.omit({
  code: true,
  billing_address: true,
  shipping_address: true,
  notes: true,
})

export type CustomerEditFormValues = z.input<typeof customerEditSchema>
export type CustomerEditSubmitValues = z.output<typeof customerEditSchema>
