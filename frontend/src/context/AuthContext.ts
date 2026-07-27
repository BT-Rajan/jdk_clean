import { createContext } from 'react'
import type { ChangePasswordPayload, LoginPayload, User } from '@/types/auth'

export type AuthStatus = 'bootstrapping' | 'authenticated' | 'unauthenticated'

export interface AuthContextValue {
  user: User | null
  status: AuthStatus
  loginUser: (payload: LoginPayload) => Promise<void>
  logoutUser: () => Promise<void>
  changeUserPassword: (payload: ChangePasswordPayload) => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
