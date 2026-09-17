import type { MeOut, UserRole } from '../api/auth';

/**
 * Mirrors frontend/src/lib/roles.ts -- keep in sync if that file changes.
 * Mirrors the write_roles guards used across the backend routers:
 * customers/suppliers/raw-materials/products/quotations/orders default
 * to page-key gating via the department_permissions matrix, where
 * admin always passes and department_head gets full (unfiltered)
 * department access -- see backend/app/core/permissions.py's module
 * docstring. 'manager' kept for backward compatibility with any
 * not-yet-migrated legacy row.
 */
export function canWrite(role: UserRole | undefined): boolean {
  return role === 'admin' || role === 'manager' || role === 'department_head';
}

/** Inventory adjustments allow team_member/staff too (see api/inventory.py write_guard). */
export function canAdjustInventory(role: UserRole | undefined): boolean {
  return (
    role === 'admin' || role === 'manager' || role === 'department_head' ||
    role === 'staff' || role === 'team_member'
  );
}

/**
 * UI-only convenience gate for a fixed document type's "New"/edit
 * actions -- admin/manager/department_head always pass regardless of
 * their own department. The actual write access is enforced
 * server-side by the department_permissions matrix, so getting this
 * slightly stale just means a team_member sees an action that 403s
 * rather than one that's missing.
 */
export function canWriteDepartment(user: MeOut | null | undefined, department: string): boolean {
  if (!user) return false;
  if (user.role === 'admin' || user.role === 'manager' || user.role === 'department_head') return true;
  return (user.role === 'staff' || user.role === 'team_member') && user.department_code === department;
}

export function isAdmin(role: UserRole | undefined): boolean {
  return role === 'admin';
}
