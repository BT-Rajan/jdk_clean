/** Mirrors backend/app/schemas/settings.py. Admin-only. */

export type AiProvider = '' | 'claude' | 'deepseek'

export interface Settings {
  company_name: string
  company_address: string
  company_phone: string
  company_email: string
  company_gstin: string
  ai_provider: AiProvider
  /** Masked (e.g. "••••••••ab12") once set -- never the real key. */
  ai_api_key: string
}

export type SettingsPayload = Partial<Settings>
