import { createContext } from 'react'
import type { ChangePasswordPayload, LoginPayload, User } from '@/types/auth'
import type { MyPermissions } from '@/types/permission'

export type AuthStatus = 'bootstrapping' | 'authenticated' | 'unauthenticated'

export interface AuthContextValue {
  user: User | null
  status: AuthStatus
  /** This user's own effective access per page (department-governed for
   * staff, always-write for admin/manager, always-read for viewer). Null
   * while not yet loaded -- PagePermissionGuard treats that the same as
   * bootstrapping, not as "no access", so it never flashes a denial
   * before the real answer arrives. */
  permissions: MyPermissions | null
  loginUser: (payload: LoginPayload) => Promise<void>
  logoutUser: () => Promise<void>
  changeUserPassword: (payload: ChangePasswordPayload) => Promise<void>
  /** Replaces the in-memory user with fresher data returned by a profile/
   * avatar update -- avoids an extra round-trip re-fetch of /me. */
  updateUser: (user: User) => void
  /** The avatar URL string never changes across re-uploads (it's always
   * /api/auth/me/avatar) -- bump this after an avatar mutation so
   * consumers know to re-fetch the image rather than reuse a cached blob. */
  avatarVersion: number
  refreshAvatar: () => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)
