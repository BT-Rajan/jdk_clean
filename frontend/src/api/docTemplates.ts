import type { DocLanguage, DocTemplateSlot, DocType } from '@/types/docTemplate'
import { apiClient } from './client'

export async function listDocTemplates(): Promise<DocTemplateSlot[]> {
  const { data } = await apiClient.get<DocTemplateSlot[]>('/api/doc-templates')
  return data
}

export async function uploadDocTemplate(docType: DocType, language: DocLanguage, file: File): Promise<DocTemplateSlot> {
  const form = new FormData()
  form.append('file', file)
  // See api/auth.ts's uploadAvatar for why Content-Type must be cleared
  // here -- apiClient's default JSON header otherwise makes axios
  // JSON.stringify the FormData instead of sending it as multipart.
  const { data } = await apiClient.post<DocTemplateSlot>(`/api/doc-templates/${docType}/${language}`, form, {
    headers: { 'Content-Type': undefined },
  })
  return data
}

export async function resetDocTemplate(docType: DocType, language: DocLanguage): Promise<DocTemplateSlot> {
  const { data } = await apiClient.delete<DocTemplateSlot>(`/api/doc-templates/${docType}/${language}`)
  return data
}

/** Triggers a browser download of whichever template is currently active
 * (custom or default) for this (doc_type, language) -- via a Blob
 * response, same pattern as downloadQuotationPdf. */
export async function downloadDocTemplate(docType: DocType, language: DocLanguage): Promise<void> {
  const response = await apiClient.get(`/api/doc-templates/${docType}/${language}/download`, { responseType: 'blob' })
  const url = window.URL.createObjectURL(new Blob([response.data]))
  const link = document.createElement('a')
  link.href = url
  link.download = `${docType}_${language}.docx`
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}

/** The active template's content as editable HTML, for the full-screen
 * field-mapping editor (TemplateFieldMapperModal) -- distinct from
 * downloadDocTemplate, which triggers a file download instead. */
export async function getDocTemplateHtml(docType: DocType, language: DocLanguage): Promise<string> {
  const { data } = await apiClient.get<{ html: string }>(`/api/doc-templates/${docType}/${language}/html`)
  return data.html
}

/** Saves the field-mapping editor's edited HTML as the new custom
 * template for this slot. */
export async function saveDocTemplateHtml(
  docType: DocType,
  language: DocLanguage,
  html: string,
): Promise<DocTemplateSlot> {
  const { data } = await apiClient.put<DocTemplateSlot>(`/api/doc-templates/${docType}/${language}/html`, { html })
  return data
}
