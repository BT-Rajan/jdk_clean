import type { UserRole } from '@/types/auth'

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

export function isAdmin(role: UserRole | undefined): boolean {
  return role === 'admin'
}
