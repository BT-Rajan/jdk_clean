import { z } from 'zod'

// Mirrors backend/app/schemas/user.py UserCreate/UserUpdate. department_id
// is validated against the Department master server-side (UserCRUD); here
// it just needs to coerce the <select>'s string value to a whole number,
// or stay '' for "no department" (mapped to null on submit) -- same
// z.coerce + z.input/z.output split as lib/validation/machine.ts.
// Same "optional, trimmed, capped at 30 chars" rule as
// lib/validation/auth.ts's profileSchema.phone -- one phone field, one
// validation rule, whether it's self-service or admin-edited.
const phoneField = z.string().trim().max(30, 'Phone number is too long').optional().or(z.literal(''))

export const userCreateSchema = z.object({
  username: z.string().trim().min(3, 'At least 3 characters').max(50),
  email: z.string().trim().email('Enter a valid email'),
  password: z.string().min(8, 'At least 8 characters'),
  full_name: z.string().trim().min(1, 'Full name is required').max(120),
  phone: phoneField,
  role: z.enum(['admin', 'manager', 'staff', 'viewer']),
  department_id: z.coerce.number().int().optional().or(z.literal('')),
})

export type UserCreateFormValues = z.input<typeof userCreateSchema>
export type UserCreateSubmitValues = z.output<typeof userCreateSchema>

// UserUpdate has no username or password -- both are immutable/out of
// scope here (password changes go through the user's own change-password
// flow, or the admin "Reset password" action, not this form).
export const userEditSchema = z.object({
  email: z.string().trim().email('Enter a valid email'),
  full_name: z.string().trim().min(1, 'Full name is required').max(120),
  phone: phoneField,
  role: z.enum(['admin', 'manager', 'staff', 'viewer']),
  department_id: z.coerce.number().int().optional().or(z.literal('')),
  is_active: z.boolean(),
})

export type UserEditFormValues = z.input<typeof userEditSchema>
export type UserEditSubmitValues = z.output<typeof userEditSchema>

// Admin-initiated password reset (POST /api/users/{id}/reset-password) --
// mirrors the backend's AdminResetPasswordRequest (min length 8), plus a
// client-side confirmation field the backend doesn't need.
export const adminResetPasswordSchema = z
  .object({
    new_password: z.string().min(8, 'At least 8 characters'),
    confirm_password: z.string().min(8, 'At least 8 characters'),
  })
  .refine((data) => data.new_password === data.confirm_password, {
    message: 'Passwords do not match',
    path: ['confirm_password'],
  })

export type AdminResetPasswordFormValues = z.infer<typeof adminResetPasswordSchema>
