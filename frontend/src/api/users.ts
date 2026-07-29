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

/** Admin-only: uploads and assigns a signature image directly to a user
 * (no self-upload, no approval step -- see api/users.py). */
export async function uploadUserSignature(id: number, file: File): Promise<User> {
  const form = new FormData()
  form.append('file', file)
  // Same apiClient JSON-default gotcha as uploadAvatar in api/auth.ts --
  // must clear Content-Type for this one request so axios's FormData
  // branch applies instead of JSON.stringify-ing the file away.
  const { data } = await apiClient.post<User>(`/api/users/${id}/signature`, form, {
    headers: { 'Content-Type': undefined },
  })
  return data
}

export async function deleteUserSignature(id: number): Promise<User> {
  const { data } = await apiClient.delete<User>(`/api/users/${id}/signature`)
  return data
}

/** Fetches a user's signature image as a Blob for inline preview. */
export async function fetchUserSignatureBlob(id: number): Promise<Blob> {
  const { data } = await apiClient.get<Blob>(`/api/users/${id}/signature`, { responseType: 'blob' })
  return data
}
