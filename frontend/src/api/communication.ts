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
import type {
  WhatsAppAccount,
  WhatsAppAccountFormValues,
  WhatsAppTemplate,
  WhatsAppTestResult,
} from '@/types/whatsappAccount'
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

export async function getWhatsAppAccount(): Promise<WhatsAppAccount> {
  const { data } = await apiClient.get<WhatsAppAccount>('/api/communication/whatsapp')
  return data
}

export async function updateWhatsAppAccount(payload: WhatsAppAccountFormValues): Promise<WhatsAppAccount> {
  const { data } = await apiClient.put<WhatsAppAccount>('/api/communication/whatsapp', payload)
  return data
}

export async function testWhatsAppAccount(): Promise<WhatsAppTestResult> {
  const { data } = await apiClient.post<WhatsAppTestResult>('/api/communication/whatsapp/test')
  return data
}

export async function getWhatsAppTemplates(): Promise<WhatsAppTemplate[]> {
  const { data } = await apiClient.get<WhatsAppTemplate[]>('/api/communication/whatsapp/templates')
  return data
}

export async function sendWhatsAppTestTemplate(payload: {
  to: string
  template_name: string
  language: string
  body_params: string[]
}): Promise<WhatsAppTestResult> {
  const { data } = await apiClient.post<WhatsAppTestResult>('/api/communication/whatsapp/send-test', payload)
  return data
}
