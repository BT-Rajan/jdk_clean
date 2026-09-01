/** Mirrors backend/app/schemas/email_template.py. */

export interface EmailTemplate {
  id: number
  template_key: string
  name: string
  subject: string
  body: string
  /** Comma-separated {placeholder} names this template's key fills in
   * when it's rendered -- documentation only, shown as a hint. */
  placeholders: string
  updated_at: string
}

export interface EmailTemplatePayload {
  subject: string
  body: string
}
