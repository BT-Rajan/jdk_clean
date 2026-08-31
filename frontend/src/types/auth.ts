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
  /** References the Department master (types/department.ts) -- id is the
   * authoritative FK, code/name are denormalized for display and for the
   * fixed document-type write gates in lib/roles.ts (canWriteDepartment),
   * which compare against code since those gates are tied to fixed
   * document types (sales/procurement/warehouse), not to a specific
   * department row. */
  department_id: number | null
  department_code: string | null
  department_name: string | null
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
