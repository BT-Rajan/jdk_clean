import { z } from 'zod'

// Mirrors backend/app/schemas/email_template.py.
export const emailTemplateSchema = z.object({
  subject: z.string().trim().min(1, 'Subject is required'),
  body: z.string().trim().min(1, 'Body is required'),
})

export type EmailTemplateFormValues = z.infer<typeof emailTemplateSchema>
