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

  // -- Customer Master fields (see backend/app/models/customer.py) --
  parent_company_id: z.coerce.number().int().optional().or(z.literal('')),
  job_position: z.string().trim().max(120, 'Max 120 characters').optional().or(z.literal('')),
  website: z.string().trim().max(255, 'Max 255 characters').optional().or(z.literal('')),
  // Entered as a comma-separated list, split into an array on submit --
  // see _submitTags below. Simpler than a bespoke multi-select tag
  // widget for a field with no fixed picklist.
  tags: z.string().trim().max(500, 'Max 500 characters').optional().or(z.literal('')),
  address_line1: z.string().trim().max(255, 'Max 255 characters').optional().or(z.literal('')),
  address_line2: z.string().trim().max(255, 'Max 255 characters').optional().or(z.literal('')),
  state: z.string().trim().max(80, 'Max 80 characters').optional().or(z.literal('')),
  payment_method: z.enum(['cash', 'credit_card', 'bank_transfer', 'cheque', 'other']).optional().or(z.literal('')),
  pricelist: z.string().trim().max(100, 'Max 100 characters').optional().or(z.literal('')),
  group_rfq: z.boolean().optional(),
  buyer_id: z.coerce.number().int().optional().or(z.literal('')),
  purchase_payment_terms_days: z.coerce.number().int().min(0, 'Must be 0 or more').optional().or(z.literal('')),
  purchase_payment_terms_type: z.enum(['cash', 'advance', 'credit', 'custom']).optional().or(z.literal('')),
  purchase_payment_method: z
    .enum(['cash', 'credit_card', 'bank_transfer', 'cheque', 'other'])
    .optional()
    .or(z.literal('')),
  receipt_reminder: z.boolean().optional(),
  supplier_currency: z.string().trim().max(10, 'Max 10 characters').optional().or(z.literal('')),
  fiscal_position: z.string().trim().max(120, 'Max 120 characters').optional().or(z.literal('')),
  reference: z.string().trim().max(100, 'Max 100 characters').optional().or(z.literal('')),
  bank_accounts: z
    .array(
      z.object({
        bank_name: z.string().trim().max(120, 'Max 120 characters'),
        account_number: z.string().trim().max(60, 'Max 60 characters'),
        iban: z.string().trim().max(42, 'Max 42 characters').optional().or(z.literal('')),
        swift_code: z.string().trim().max(20, 'Max 20 characters').optional().or(z.literal('')),
      }),
    )
    .optional(),
  account_receivable: z.string().trim().max(50, 'Max 50 characters').optional().or(z.literal('')),
  account_payable: z.string().trim().max(50, 'Max 50 characters').optional().or(z.literal('')),
  auto_post_bills: z.enum(['manual', 'automatic']).optional().or(z.literal('')),
  follow_up_stage: z.enum(['none', '15_days', '30_days', '45_days', 'legal']).optional().or(z.literal('')),
  follow_up_status: z.enum(['up_to_date', 'in_progress', 'overdue', 'escalated']).optional().or(z.literal('')),
  reminder_mode: z.enum(['automatic', 'manual']).optional().or(z.literal('')),
  next_reminder_date: z.string().trim().optional().or(z.literal('')),
  followup_responsible_id: z.coerce.number().int().optional().or(z.literal('')),
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

function withBankAccountRowCheck<
  T extends z.ZodType<{ bank_accounts?: { bank_name: string; account_number: string }[] }>,
>(schema: T) {
  // Mirrors CustomerBankAccount on the backend: bank_name/account_number
  // are required once a row exists at all (iban/swift_code stay optional).
  return schema.refine(
    (v) => (v.bank_accounts ?? []).every((row) => row.bank_name.trim() && row.account_number.trim()),
    { message: 'Bank name and account number are required for each bank account.', path: ['bank_accounts'] },
  )
}

export const customerSchema = withBankAccountRowCheck(withCreditTermsCheck(customerBaseSchema))

export type CustomerFormValues = z.input<typeof customerSchema>
export type CustomerSubmitValues = z.output<typeof customerSchema>

/** Edit form only: name and code (civil ID / registration number) are
 * locked after creation -- see CustomerFormPage. Every other field,
 * billing/shipping address and notes included, is editable at any time. */
export const customerEditSchema = withBankAccountRowCheck(
  withCreditTermsCheck(
    customerBaseSchema.omit({
      code: true,
      name: true,
    }),
  ),
)

export type CustomerEditFormValues = z.input<typeof customerEditSchema>
export type CustomerEditSubmitValues = z.output<typeof customerEditSchema>

/** Splits the comma-separated `tags` form field into the string[] the
 * API expects, dropping blanks. Returns undefined (omit from payload)
 * rather than [] for an empty input. */
export function parseTagsInput(value: string | undefined): string[] | undefined {
  if (!value) return undefined
  const tags = value
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
  return tags.length > 0 ? tags : undefined
}

/** Reverse of parseTagsInput, for populating the form field from a
 * loaded Customer. */
export function formatTagsInput(tags: string[] | null | undefined): string {
  return tags && tags.length > 0 ? tags.join(', ') : ''
}
