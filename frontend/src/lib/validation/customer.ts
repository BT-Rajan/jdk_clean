import { z } from 'zod'

// Mirrors backend/app/schemas/customer.py CustomerCreate/CustomerUpdate.
export const customerSchema = z.object({
  customer_type: z.enum(['individual', 'business']),
  code: z.string().trim().min(1, 'Civil ID / Registration number is required').max(30),
  name: z.string().trim().min(1, 'Name is required').max(150),
  nature_of_business: z.string().trim().max(150, 'Max 150 characters').optional().or(z.literal('')),
  contact_person: z.string().trim().max(120, 'Max 120 characters').optional().or(z.literal('')),
  email: z.string().trim().email('Enter a valid email').max(120, 'Max 120 characters').optional().or(z.literal('')),
  phone: z.string().trim().max(30, 'Max 30 characters').optional().or(z.literal('')),
  billing_address: z.string().trim().max(255, 'Max 255 characters').optional().or(z.literal('')),
  shipping_address: z.string().trim().max(255, 'Max 255 characters').optional().or(z.literal('')),
  city: z.string().trim().max(80, 'Max 80 characters').optional().or(z.literal('')),
  country: z.string().trim().max(80, 'Max 80 characters').optional().or(z.literal('')),
  credit_limit: z.coerce.number().min(0, 'Must be 0 or more'),
  payment_terms_days: z.coerce.number().int().min(0, 'Must be 0 or more'),
  status: z.enum(['active', 'inactive']),
  notes: z.string().trim().max(5000, 'Max 5000 characters').optional().or(z.literal('')),
})

export type CustomerFormValues = z.input<typeof customerSchema>
export type CustomerSubmitValues = z.output<typeof customerSchema>

/** Edit form only: name and code (civil ID / registration number) are
 * locked after creation -- see CustomerFormPage. Every other field,
 * billing/shipping address and notes included, is editable at any time. */
export const customerEditSchema = customerSchema.omit({
  code: true,
  name: true,
})

export type CustomerEditFormValues = z.input<typeof customerEditSchema>
export type CustomerEditSubmitValues = z.output<typeof customerEditSchema>
