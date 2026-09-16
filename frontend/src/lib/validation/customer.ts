import { z } from 'zod'

// Mirrors backend/app/schemas/customer.py CustomerCreate/CustomerUpdate.
//
// Base shape kept separate from the refined schema below: zod's
// `.omit()` cannot be called on a schema that already has `.refine()`
// applied (it throws "`.omit()` cannot be used on object schemas
// containing refinements" at import time, crashing the entire app on
// load, not just this form -- see lib/validation/rawMaterial.ts for the
// same lesson learned there first). Both the create and edit schemas
// are built from this same base object instead, each with the same
// cross-field check applied independently.
const customerBaseSchema = z.object({
  customer_type: z.enum(['individual', 'business']),
  code: z.string().trim().min(1, 'Civil ID / Registration number is required').max(30),
  name: z.string().trim().min(1, 'Name is required').max(150),
  trade_name: z.string().trim().max(150, 'Max 150 characters').optional().or(z.literal('')),
  contact_person: z.string().trim().max(120, 'Max 120 characters').optional().or(z.literal('')),
  email: z.string().trim().email('Enter a valid email').max(120, 'Max 120 characters').optional().or(z.literal('')),
  phone: z.string().trim().max(30, 'Max 30 characters').optional().or(z.literal('')),
  alternate_phone: z.string().trim().max(30, 'Max 30 characters').optional().or(z.literal('')),
  alternate_email: z
    .string()
    .trim()
    .email('Enter a valid email')
    .max(120, 'Max 120 characters')
    .optional()
    .or(z.literal('')),
  billing_address: z.string().trim().max(255, 'Max 255 characters').optional().or(z.literal('')),
  shipping_address: z.string().trim().max(255, 'Max 255 characters').optional().or(z.literal('')),
  city: z.string().trim().max(80, 'Max 80 characters').optional().or(z.literal('')),
  country: z.string().trim().max(80, 'Max 80 characters').optional().or(z.literal('')),
  category: z.string().trim().max(100, 'Max 100 characters').optional().or(z.literal('')),
  credit_limit: z.coerce.number().min(0, 'Must be 0 or more'),
  payment_terms_days: z.coerce.number().int().min(0, 'Must be 0 or more'),
  payment_terms_type: z.enum(['cash', 'advance', 'credit', 'custom']),
  discount_approval_threshold_override: z.coerce
    .number()
    .min(0, 'Must be 0 or more')
    .max(100, 'Must be 100 or less')
    .optional()
    .or(z.literal('')),
  status: z.enum(['active', 'inactive']),
  notes: z.string().trim().max(5000, 'Max 5000 characters').optional().or(z.literal('')),
})

function withCreditTermsCheck<T extends z.ZodType<{ payment_terms_type: string; payment_terms_days: number }>>(
  schema: T,
) {
  // Mirrors CustomerCreate's model_validator on the backend: Credit
  // terms need a real number of days on record.
  return schema.refine((v) => v.payment_terms_type !== 'credit' || v.payment_terms_days > 0, {
    message: 'Credit days is required when payment terms is Credit.',
    path: ['payment_terms_days'],
  })
}

export const customerSchema = withCreditTermsCheck(customerBaseSchema)

export type CustomerFormValues = z.input<typeof customerSchema>
export type CustomerSubmitValues = z.output<typeof customerSchema>

/** Edit form only: name and code (civil ID / registration number) are
 * locked after creation -- see CustomerFormPage. Every other field,
 * billing/shipping address and notes included, is editable at any time. */
export const customerEditSchema = withCreditTermsCheck(
  customerBaseSchema.omit({
    code: true,
    name: true,
  }),
)

export type CustomerEditFormValues = z.input<typeof customerEditSchema>
export type CustomerEditSubmitValues = z.output<typeof customerEditSchema>
