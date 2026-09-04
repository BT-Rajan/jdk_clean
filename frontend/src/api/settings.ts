import type { LogoVariant, Settings, SettingsPayload } from '@/types/settings'
import { apiClient } from './client'

export async function getSettings(): Promise<Settings> {
  const { data } = await apiClient.get<Settings>('/api/settings')
  return data
}

export async function updateSettings(payload: SettingsPayload): Promise<Settings> {
  const { data } = await apiClient.put<Settings>('/api/settings', payload)
  return data
}

export async function uploadCompanyLogo(variant: LogoVariant, file: File): Promise<Settings> {
  const form = new FormData()
  form.append('file', file)
  // See api/auth.ts's uploadAvatar for why Content-Type must be cleared
  // here -- apiClient's default JSON header otherwise makes axios
  // JSON.stringify the FormData instead of sending it as multipart.
  const { data } = await apiClient.post<Settings>(`/api/settings/logo/${variant}`, form, {
    headers: { 'Content-Type': undefined },
  })
  return data
}

export async function deleteCompanyLogo(variant: LogoVariant): Promise<Settings> {
  const { data } = await apiClient.delete<Settings>(`/api/settings/logo/${variant}`)
  return data
}

/** Fetches a company logo as a Blob -- like fetchAvatarBlob, the serving
 * endpoint requires an Authorization header a plain <img src> can't send. */
export async function fetchCompanyLogoBlob(variant: LogoVariant): Promise<Blob> {
  const { data } = await apiClient.get<Blob>(`/api/settings/logo/${variant}`, { responseType: 'blob' })
  return data
}

/** Deliberately unauthenticated on the backend (see api/settings.py's
 * get_active_company_name) -- <Logo> calls this before there's
 * necessarily a signed-in user (the login page), same reasoning as the
 * logo image's own public endpoint. */
export async function getActiveCompanyName(): Promise<string> {
  const { data } = await apiClient.get<{ company_name: string }>('/api/settings/company-name/current')
  return data.company_name
}
