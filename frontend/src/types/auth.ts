/**
 * Mirrors backend/app/schemas/auth.py and backend/app/schemas/user.py.
 * Keep these in sync with the backend when either side changes shape.
 */

export type UserRole = 'admin' | 'manager' | 'staff' | 'viewer'
export type UserDepartment = 'sales' | 'procurement' | 'warehouse'

export interface User {
  id: number
  username: string
  email: string
  full_name: string
  phone: string | null
  role: UserRole
  department: UserDepartment | null
  /** Org chart reporting line (Admin -> Access control -> Org chart) --
   * the id of the manager-role user this user reports to. Only ever set
   * for staff/viewer ("Member") rows; admin/manager rows leave it null. */
  manager_id: number | null
  has_signature: boolean
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
