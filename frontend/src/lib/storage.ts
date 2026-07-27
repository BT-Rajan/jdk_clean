/**
 * Refresh-token persistence, isolated behind one module.
 *
 * Security tradeoff, documented rather than hidden: the backend issues the
 * refresh token in the JSON response body (not an httpOnly cookie), so pure
 * client-side JS has no choice but to hold onto it somewhere accessible to
 * JS if we want a page reload to survive without forcing a re-login. We use
 * sessionStorage (cleared when the tab/browser closes) rather than
 * localStorage (persists indefinitely) to bound the exposure window, and the
 * access token is never persisted at all -- it only ever lives in memory
 * (see context/AuthContext.tsx) and disappears completely on reload.
 *
 * If the backend later moves to an httpOnly, Secure, SameSite=strict cookie
 * for the refresh token, this file becomes a no-op and can be deleted --
 * nothing outside AuthContext needs to change.
 */

const REFRESH_TOKEN_KEY = 'jdk_erp.refresh_token'

function isStorageAvailable(): boolean {
  try {
    const testKey = '__storage_test__'
    window.sessionStorage.setItem(testKey, '1')
    window.sessionStorage.removeItem(testKey)
    return true
  } catch {
    return false
  }
}

export const refreshTokenStorage = {
  get(): string | null {
    if (!isStorageAvailable()) return null
    return window.sessionStorage.getItem(REFRESH_TOKEN_KEY)
  },
  set(token: string): void {
    if (!isStorageAvailable()) return
    window.sessionStorage.setItem(REFRESH_TOKEN_KEY, token)
  },
  clear(): void {
    if (!isStorageAvailable()) return
    window.sessionStorage.removeItem(REFRESH_TOKEN_KEY)
  },
}
