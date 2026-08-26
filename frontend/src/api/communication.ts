import type {
  EmailAccount,
  EmailAccountFormValues,
  EmailAccountTestResult,
  EmailProviderPresets,
} from '@/types/emailAccount'
import { apiClient } from './client'

export async function getEmailProviders(): Promise<EmailProviderPresets> {
  const { data } = await apiClient.get<EmailProviderPresets>('/api/communication/email/providers')
  return data
}

export async function getEmailAccount(): Promise<EmailAccount> {
  const { data } = await apiClient.get<EmailAccount>('/api/communication/email')
  return data
}

export async function updateEmailAccount(payload: EmailAccountFormValues): Promise<EmailAccount> {
  const { data } = await apiClient.put<EmailAccount>('/api/communication/email', payload)
  return data
}

export async function testEmailAccount(): Promise<EmailAccountTestResult> {
  const { data } = await apiClient.post<EmailAccountTestResult>('/api/communication/email/test')
  return data
}
