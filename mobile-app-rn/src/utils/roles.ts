import type { MeOut, UserRole } from '../api/auth';

/**
 * Mirrors frontend/src/lib/roles.ts -- keep in sync if that file changes.
 * Mirrors the write_roles guards used across the backend routers:
 * customers/suppliers/raw-materials/products/quotations/orders default to
 * require_role("admin", "manager") (see api/common.py build_crud_router),
 * so the same two roles gate write actions here.
 */
export function canWrite(role: UserRole | undefined): boolean {
  return role === 'admin' || role === 'manager';
}

/** Inventory adjustments allow staff too (see api/inventory.py write_guard). */
export function canAdjustInventory(role: UserRole | undefined): boolean {
  return role === 'admin' || role === 'manager' || role === 'staff';
}

/**
 * UI-only convenience gate for a fixed document type's "New"/edit
 * actions -- admin/manager always pass regardless of their own
 * department. The actual write access is enforced server-side by the
 * department_permissions matrix, so getting this slightly stale just
 * means a staff member sees an action that 403s rather than one that's
 * missing.
 */
export function canWriteDepartment(user: MeOut | null | undefined, department: string): boolean {
  if (!user) return false;
  if (user.role === 'admin' || user.role === 'manager') return true;
  return user.role === 'staff' && user.department_code === department;
}

export function isAdmin(role: UserRole | undefined): boolean {
  return role === 'admin';
}
