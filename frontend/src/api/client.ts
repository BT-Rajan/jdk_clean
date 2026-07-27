import axios from 'axios'
import type { AxiosError, InternalAxiosRequestConfig } from 'axios'
import { env } from '@/config/env'
import { refreshTokenStorage } from '@/lib/storage'
import type { TokenResponse } from '@/types/auth'
import { tokenStore } from './tokenStore'

export const apiClient = axios.create({
  baseURL: env.apiBaseUrl,
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
})

// Attach the current access token, if any, to every outgoing request.
apiClient.interceptors.request.use((config) => {
  const token = tokenStore.getAccessToken()
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`)
  }
  return config
})

// These must never trigger a refresh-and-retry themselves, or a bad
// credential/refresh call could recurse into itself.
const NO_REFRESH_PATHS = ['/api/auth/login', '/api/auth/refresh']

type RetryableConfig = InternalAxiosRequestConfig & { _retried?: boolean }

let refreshPromise: Promise<string | null> | null = null

/** Calls /api/auth/refresh with a *plain* axios instance (not `apiClient`)
 * so this request can never itself pass back through the interceptor
 * below and recurse. */
async function performRefresh(): Promise<string | null> {
  const refreshToken = refreshTokenStorage.get()
  if (!refreshToken) return null

  try {
    const response = await axios.post<TokenResponse>(
      `${env.apiBaseUrl}/api/auth/refresh`,
      { refresh_token: refreshToken },
    )
    const { access_token, refresh_token } = response.data
    tokenStore.setAccessToken(access_token)
    refreshTokenStorage.set(refresh_token)
    return access_token
  } catch {
    return null
  }
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as RetryableConfig | undefined
    const isAuthEndpoint = Boolean(
      original?.url && NO_REFRESH_PATHS.some((path) => original.url!.includes(path)),
    )

    if (error.response?.status !== 401 || !original || original._retried || isAuthEndpoint) {
      throw error
    }

    original._retried = true

    // Single-flight: concurrent 401s piggyback on one /refresh call
    // instead of each firing their own.
    refreshPromise ??= performRefresh().finally(() => {
      refreshPromise = null
    })

    const newAccessToken = await refreshPromise

    if (!newAccessToken) {
      tokenStore.setAccessToken(null)
      refreshTokenStorage.clear()
      tokenStore.notifyUnauthorized()
      throw error
    }

    original.headers.set('Authorization', `Bearer ${newAccessToken}`)
    return apiClient(original)
  },
)
