import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import * as authApi from '@/api/auth'
import { getMyPermissions } from '@/api/permissions'
import { tokenStore } from '@/api/tokenStore'
import { refreshTokenStorage } from '@/lib/storage'
import type { ChangePasswordPayload, LoginPayload, User } from '@/types/auth'
import type { MyPermissions } from '@/types/permission'
import { AuthContext, type AuthContextValue, type AuthStatus } from './AuthContext'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [permissions, setPermissions] = useState<MyPermissions | null>(null)
  const [status, setStatus] = useState<AuthStatus>('bootstrapping')
  const hasBootstrapped = useRef(false)

  const clearSession = useCallback(() => {
    tokenStore.setAccessToken(null)
    refreshTokenStorage.clear()
    setUser(null)
    setPermissions(null)
    setStatus('unauthenticated')
  }, [])

  // Runs once on load: if a refresh token survived from a previous visit
  // (sessionStorage), silently exchange it for a fresh access token and
  // restore the session -- otherwise the user starts logged out.
  useEffect(() => {
    if (hasBootstrapped.current) return
    hasBootstrapped.current = true

    const existingRefreshToken = refreshTokenStorage.get()
    if (!existingRefreshToken) {
      setStatus('unauthenticated')
      return
    }

    authApi
      .refresh(existingRefreshToken)
      .then(async (tokens) => {
        tokenStore.setAccessToken(tokens.access_token)
        refreshTokenStorage.set(tokens.refresh_token)
        const [currentUser, myPermissions] = await Promise.all([authApi.getCurrentUser(), getMyPermissions()])
        setUser(currentUser)
        setPermissions(myPermissions)
        setStatus('authenticated')
      })
      .catch(() => {
        clearSession()
      })
  }, [clearSession])

  // The API client fires this when a background refresh attempt fails
  // (e.g. the refresh token expired or was revoked elsewhere) so an
  // already-rendered app can drop back to the login screen cleanly.
  useEffect(() => {
    return tokenStore.onUnauthorized(clearSession)
  }, [clearSession])

  const loginUser = useCallback(async (payload: LoginPayload) => {
    const tokens = await authApi.login(payload)
    tokenStore.setAccessToken(tokens.access_token)
    refreshTokenStorage.set(tokens.refresh_token)
    const [currentUser, myPermissions] = await Promise.all([authApi.getCurrentUser(), getMyPermissions()])
    setUser(currentUser)
    setPermissions(myPermissions)
    setStatus('authenticated')
  }, [])

  const logoutUser = useCallback(async () => {
    const currentRefreshToken = refreshTokenStorage.get()
    try {
      if (currentRefreshToken) {
        await authApi.logout(currentRefreshToken)
      }
    } catch {
      // Best-effort revoke -- clear the local session regardless.
    } finally {
      clearSession()
    }
  }, [clearSession])

  const changeUserPassword = useCallback(
    async (payload: ChangePasswordPayload) => {
      await authApi.changePassword(payload)
      // The backend revokes every outstanding refresh token for this user
      // on a successful change, so the current session is already dead
      // server-side -- clear it locally too and require a fresh login.
      clearSession()
    },
    [clearSession],
  )

  const [avatarVersion, setAvatarVersion] = useState(0)
  const refreshAvatar = useCallback(() => setAvatarVersion((v) => v + 1), [])

  const updateUser = useCallback((updated: User) => {
    setUser(updated)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      permissions,
      status,
      loginUser,
      logoutUser,
      changeUserPassword,
      updateUser,
      avatarVersion,
      refreshAvatar,
    }),
    [user, permissions, status, loginUser, logoutUser, changeUserPassword, updateUser, avatarVersion, refreshAvatar],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
