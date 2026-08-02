import type { MyPermissions, PermissionEntry } from '@/types/permission'
import { apiClient } from './client'

/** Any authenticated user's own effective access per page. */
export async function getMyPermissions(): Promise<MyPermissions> {
  const { data } = await apiClient.get<MyPermissions>('/api/permissions/me')
  return data
}

/** Admin/manager only: the full department x page grid. */
export async function getPermissionMatrix(): Promise<PermissionEntry[]> {
  const { data } = await apiClient.get<PermissionEntry[]>('/api/permissions')
  return data
}

export async function updatePermissionMatrix(entries: PermissionEntry[]): Promise<PermissionEntry[]> {
  const { data } = await apiClient.put<PermissionEntry[]>('/api/permissions', { entries })
  return data
}

export async function listPermissionPages(): Promise<string[]> {
  const { data } = await apiClient.get<{ pages: string[] }>('/api/permissions/pages')
  return data.pages
}
