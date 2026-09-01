import type { EmailTemplate, EmailTemplatePayload } from '@/types/emailTemplate'
import { apiClient } from './client'

export async function listEmailTemplates(): Promise<EmailTemplate[]> {
  const { data } = await apiClient.get<EmailTemplate[]>('/api/email-templates')
  return data
}

export async function updateEmailTemplate(
  templateKey: string,
  payload: EmailTemplatePayload,
): Promise<EmailTemplate> {
  const { data } = await apiClient.put<EmailTemplate>(`/api/email-templates/${templateKey}`, payload)
  return data
}
