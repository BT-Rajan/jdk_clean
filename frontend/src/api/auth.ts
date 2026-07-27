import type {
  ChangePasswordPayload,
  LoginPayload,
  TokenResponse,
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
