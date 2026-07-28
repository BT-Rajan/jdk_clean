/**
 * Mirrors backend/app/schemas/auth.py and backend/app/schemas/user.py.
 * Keep these in sync with the backend when either side changes shape.
 */

export type UserRole = 'admin' | 'manager' | 'staff' | 'viewer'

export interface User {
  id: number
  username: string
  email: string
  full_name: string
  phone: string | null
  role: UserRole
  is_active: boolean
  avatar_url: string | null
}

export interface UpdateProfilePayload {
  full_name?: string
  phone?: string | null
}

export interface LoginPayload {
  username: string
  password: string
}

export interface TokenResponse {
  access_token: string
  refresh_token: string
  token_type: string
}

export interface ChangePasswordPayload {
  current_password: string
  new_password: string
}

/** Shape of the {"error": "..."} body returned by the backend's exception handlers. */
export interface ApiErrorBody {
  error: string
}
