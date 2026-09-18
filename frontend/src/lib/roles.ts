import type { User, UserRole } from '@/types/auth'

/**
 * Mirrors the write_roles guards used across the backend routers:
 * customers/suppliers/raw-materials/products/quotations/orders default
 * to page-key gating via the department_permissions matrix, where
 * admin always passes and department_head gets full (unfiltered)
 * department access -- see backend/app/core/permissions.py's module
 * docstring. 'manager' kept for backward compatibility with any
 * not-yet-migrated legacy row. Users management is admin-only (see
 * api/users.py) -- check that separately with isAdmin. team_member is
 * deliberately excluded here (same as 'staff' always was) -- their
 * write access is department- and ownership-scoped, not an
 * unconditional "always show the button" case.
 */
export function canWrite(role: UserRole | undefined): boolean {
  return role === 'admin' || role === 'manager' || role === 'department_head'
}

/** Inventory adjustments allow team_member/staff too (see api/inventory.py write_guard). */
export function canAdjustInventory(role: UserRole | undefined): boolean {
  return (
    role === 'admin' || role === 'manager' || role === 'department_head' ||
    role === 'staff' || role === 'team_member'
  )
}

/**
 * UI-only convenience gate for a fixed document type's "New"/edit
 * buttons: Quotations/Orders are department 'sales', Purchase Orders are
 * 'procurement', Delivery Notes are 'warehouse'. admin/manager/
 * department_head always pass regardless of their own department. The
 * actual write access is enforced server-side by the
 * department_permissions matrix (see backend/app/core/permissions.py
 * require_page_access, gated by page_key, not by this fixed department
 * mapping) -- this only decides whether to show the button before that
 * check ever runs, so getting it slightly stale just means a
 * team_member sees a button that 403s rather than one that's missing.
 */
export function canWriteDepartment(user: User | null | undefined, department: string): boolean {
  if (!user) return false
  if (user.role === 'admin' || user.role === 'manager' || user.role === 'department_head') return true
  return (user.role === 'staff' || user.role === 'team_member') && user.department_code === department
}

export function isAdmin(role: UserRole | undefined): boolean {
  return role === 'admin'
}

/** Administrator-friendly display label for a role value -- display only,
 * never used for authorization (see canWrite/canWriteDepartment/isAdmin
 * above for the actual RBAC checks, which still key off the raw enum
 * value). */
const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin',
  department_head: 'Department Head',
  team_member: 'Team Member',
  viewer: 'Viewer',
  manager: 'Manager (legacy)',
  staff: 'Staff (legacy)',
}

export function roleLabel(role: UserRole | undefined): string {
  if (!role) return '—'
  return ROLE_LABELS[role] ?? role
}
