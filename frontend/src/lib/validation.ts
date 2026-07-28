import { z } from 'zod'

export const loginSchema = z.object({
  username: z
    .string()
    .trim()
    .min(1, 'Username is required'),
  password: z
    .string()
    .min(1, 'Password is required'),
})

export type LoginFormValues = z.infer<typeof loginSchema>

// Mirrors backend ChangePasswordRequest: new_password has min_length=8.
export const changePasswordSchema = z
  .object({
    current_password: z.string().min(1, 'Current password is required'),
    new_password: z
      .string()
      .min(8, 'New password must be at least 8 characters'),
    confirm_password: z.string().min(1, 'Please confirm your new password'),
  })
  .refine((data) => data.new_password === data.confirm_password, {
    message: 'Passwords do not match',
    path: ['confirm_password'],
  })
  .refine((data) => data.current_password !== data.new_password, {
    message: 'New password must be different from the current password',
    path: ['new_password'],
  })

export type ChangePasswordFormValues = z.infer<typeof changePasswordSchema>

export const profileSchema = z.object({
  full_name: z.string().trim().min(1, 'Full name is required').max(120),
  phone: z
    .string()
    .trim()
    .max(30, 'Phone number is too long')
    .optional()
    .or(z.literal('')),
})

export type ProfileFormValues = z.infer<typeof profileSchema>
