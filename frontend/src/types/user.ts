/**
 * Mirrors backend/app/schemas/user.py. The User entity shape itself is
 * already defined in types/auth.ts (UserOut === the /auth/me shape), so
 * this file only adds the admin-only create/update payloads.
 */
import type { UserRole } from './auth'

export interface UserCreatePayload {
  username: string
  email: string
  password: string
  full_name: string
  role: UserRole
}

export interface UserUpdatePayload {
  email?: string
  full_name?: string
  role?: UserRole
  is_active?: boolean
}
