/**
 * Mirrors backend/app/schemas/department.py. The one Department type in
 * the app -- types/auth.ts (User) and types/permission.ts (PermissionEntry)
 * both reference departments by id/code rather than defining their own
 * department union, which is what used to make this a 5-times-duplicated
 * concept (Department master audit).
 */
export type DepartmentStatus = 'active' | 'inactive'

export interface Department {
  id: number
  code: string
  name: string
  status: DepartmentStatus
}

export interface DepartmentCreatePayload {
  code: string
  name: string
  status?: DepartmentStatus
}

export interface DepartmentUpdatePayload {
  name?: string
  status?: DepartmentStatus
}
