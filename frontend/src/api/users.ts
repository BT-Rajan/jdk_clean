import type { PagedResponse, ListQueryParams, MessageResponse } from '@/types/common'
import type { User } from '@/types/auth'
import type { UserCreatePayload, UserUpdatePayload } from '@/types/user'
import { apiClient } from './client'

export async function listUsers(params: ListQueryParams): Promise<PagedResponse<User>> {
  const { data } = await apiClient.get<PagedResponse<User>>('/api/users', { params })
  return data
}

export async function getUser(id: number): Promise<User> {
  const { data } = await apiClient.get<User>(`/api/users/${id}`)
  return data
}

export async function createUser(payload: UserCreatePayload): Promise<User> {
  const { data } = await apiClient.post<User>('/api/users', payload)
  return data
}

export async function updateUser(id: number, payload: UserUpdatePayload): Promise<User> {
  const { data } = await apiClient.put<User>(`/api/users/${id}`, payload)
  return data
}

export async function deleteUser(id: number): Promise<MessageResponse> {
  const { data } = await apiClient.delete<MessageResponse>(`/api/users/${id}`)
  return data
}

export async function restoreUser(id: number): Promise<User> {
  const { data } = await apiClient.post<User>(`/api/users/${id}/restore`)
  return data
}
