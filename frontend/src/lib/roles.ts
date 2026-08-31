import type { User, UserRole } from '@/types/auth'

/**
 * Mirrors the write_roles guards used across the backend routers:
 * customers/suppliers/raw-materials/products/quotations/orders default to
 * require_role("admin", "manager") (see api/common.py build_crud_router),
 * so the same two roles gate write actions here. Users management is
 * admin-only (see api/users.py) -- check that separately with isAdmin.
 */
export function canWrite(role: UserRole | undefined): boolean {
  return role === 'admin' || role === 'manager'
}

/** Inventory adjustments allow staff too (see api/inventory.py write_guard). */
export function canAdjustInventory(role: UserRole | undefined): boolean {
  return role === 'admin' || role === 'manager' || role === 'staff'
}

/**
 * UI-only convenience gate for a fixed document type's "New"/edit
 * buttons: Quotations/Orders are department 'sales', Purchase Orders are
 * 'procurement', Delivery Notes are 'warehouse'. admin/manager always
 * pass regardless of their own department. The actual write access is
 * enforced server-side by the department_permissions matrix (see
 * backend/app/core/permissions.py require_page_access, gated by
 * page_key, not by this fixed department mapping) -- this only decides
 * whether to show the button before that check ever runs, so getting it
 * slightly stale just means a staff member sees a button that 403s
 * rather than one that's missing.
 */
export function canWriteDepartment(user: User | null | undefined, department: string): boolean {
  if (!user) return false
  if (user.role === 'admin' || user.role === 'manager') return true
  return user.role === 'staff' && user.department_code === department
}

export function isAdmin(role: UserRole | undefined): boolean {
  return role === 'admin'
}
