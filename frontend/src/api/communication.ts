import type {
  EmailAccount,
  EmailAccountFormValues,
  EmailAccountTestResult,
  EmailProviderPresets,
} from '@/types/emailAccount'
import type {
  SmsAccount,
  SmsAccountFormValues,
  SmsProviderPresets,
  SmsTestResult,
} from '@/types/smsAccount'
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

export async function getSmsProviders(): Promise<SmsProviderPresets> {
  const { data } = await apiClient.get<SmsProviderPresets>('/api/communication/sms/providers')
  return data
}

export async function getSmsAccount(): Promise<SmsAccount> {
  const { data } = await apiClient.get<SmsAccount>('/api/communication/sms')
  return data
}

export async function updateSmsAccount(payload: SmsAccountFormValues): Promise<SmsAccount> {
  const { data } = await apiClient.put<SmsAccount>('/api/communication/sms', payload)
  return data
}

export async function testSmsAccount(phoneNumber: string): Promise<SmsTestResult> {
  const { data } = await apiClient.post<SmsTestResult>('/api/communication/sms/test', {
    phone_number: phoneNumber,
  })
  return data
}
