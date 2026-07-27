/**
 * The access token lives ONLY here, in a plain module-level variable --
 * never in localStorage/sessionStorage, never in a cookie. It disappears
 * the instant the tab is closed or the page reloads, which is the point:
 * it's short-lived by design (see backend ACCESS_TOKEN_EXPIRE_MINUTES),
 * so losing it on reload just means a silent refresh-on-load, not a
 * security compromise.
 */

let accessToken: string | null = null

type UnauthorizedListener = () => void
const unauthorizedListeners = new Set<UnauthorizedListener>()

export const tokenStore = {
  getAccessToken(): string | null {
    return accessToken
  },
  setAccessToken(token: string | null): void {
    accessToken = token
  },
  /** Called by the API client when a refresh attempt fails -- i.e. the
   * session is truly over, not just an expired access token. */
  notifyUnauthorized(): void {
    for (const listener of unauthorizedListeners) listener()
  },
  onUnauthorized(listener: UnauthorizedListener): () => void {
    unauthorizedListeners.add(listener)
    return () => unauthorizedListeners.delete(listener)
  },
}
