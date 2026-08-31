/**
 * Mirrors backend/app/schemas/user.py. The User entity shape itself is
 * already defined in types/auth.ts (UserOut === the /auth/me shape), so
 * this file only adds the admin-only create/update payloads.
 */
import type { UserDepartment, UserRole } from './auth'

export interface UserCreatePayload {
  username: string
  email: string
  password: string
  full_name: string
  role: UserRole
  department?: UserDepartment | null
}

export interface UserUpdatePayload {
  email?: string
  full_name?: string
  role?: UserRole
  department?: UserDepartment | null
  is_active?: boolean
  /** Org chart reporting line -- see types/auth.ts User.manager_id. Pass
   * null explicitly to unassign (drag a Member to "Unassigned"). */
  manager_id?: number | null
}
