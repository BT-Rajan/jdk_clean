import type {
  ChangePasswordPayload,
  LoginPayload,
  TokenResponse,
  UpdateProfilePayload,
  User,
} from '@/types/auth'
import { apiClient } from './client'

export async function login(payload: LoginPayload): Promise<TokenResponse> {
  const { data } = await apiClient.post<TokenResponse>('/api/auth/login', payload)
  return data
}

export async function refresh(refreshToken: string): Promise<TokenResponse> {
  const { data } = await apiClient.post<TokenResponse>('/api/auth/refresh', {
    refresh_token: refreshToken,
  })
  return data
}

export async function logout(refreshToken: string): Promise<void> {
  await apiClient.post('/api/auth/logout', { refresh_token: refreshToken })
}

export async function getCurrentUser(): Promise<User> {
  const { data } = await apiClient.get<User>('/api/auth/me')
  return data
}

export async function changePassword(payload: ChangePasswordPayload): Promise<void> {
  await apiClient.post('/api/auth/change-password', payload)
}

export async function updateProfile(payload: UpdateProfilePayload): Promise<User> {
  const { data } = await apiClient.patch<User>('/api/auth/me', payload)
  return data
}

export async function uploadAvatar(file: File): Promise<User> {
  const form = new FormData()
  form.append('file', file)
  // apiClient sets a default 'Content-Type: application/json' header on
  // every request. Axios only lets FormData pass through untouched when
  // there's no JSON content-type already present -- otherwise it actually
  // JSON.stringifies the FormData (into something like '{"file":{}}',
  // discarding the file bytes entirely) and sends *that* as JSON. Setting
  // Content-Type to undefined here removes the inherited default for just
  // this request, so axios's FormData branch applies and the browser can
  // generate the multipart boundary itself.
  const { data } = await apiClient.post<User>('/api/auth/me/avatar', form, {
    headers: { 'Content-Type': undefined },
  })
  return data
}

export async function deleteAvatar(): Promise<User> {
  const { data } = await apiClient.delete<User>('/api/auth/me/avatar')
  return data
}

/** Fetches the current user's avatar as a Blob -- can't be used as a plain
 * <img src>, since the endpoint requires an Authorization header that only
 * an authenticated fetch/axios call (not a browser <img> tag) can send. */
export async function fetchAvatarBlob(): Promise<Blob> {
  const { data } = await apiClient.get<Blob>('/api/auth/me/avatar', { responseType: 'blob' })
  return data
}
