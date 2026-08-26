/** Mirrors backend/app/schemas/whatsapp_account.py. Admin-only. */

export interface WhatsAppAccount {
  id: number | null
  phone_number_id: string
  waba_id: string
  display_phone_number: string
  verified_name: string
  /** Never the real token itself -- just whether one is set. */
  has_token: boolean
  api_version: string
  is_active: boolean
  last_tested_at: string | null
  last_test_ok: boolean | null
  last_test_error: string | null
}

export interface WhatsAppAccountFormValues {
  phone_number_id: string
  waba_id: string
  api_version: string
  /** Empty string = leave the saved token untouched unless the user
   * explicitly opted to change it -- see WhatsAppTab. */
  access_token?: string
  is_active: boolean
}

export interface WhatsAppTestResult {
  ok: boolean
  message: string
}

export interface WhatsAppTemplateComponent {
  type: string
  text: string | null
  variable_count: number
}

/** An APPROVED template as returned live by Meta -- never hand-typed. */
export interface WhatsAppTemplate {
  name: string
  language: string
  category: string
  status: string
  components: WhatsAppTemplateComponent[]
}
