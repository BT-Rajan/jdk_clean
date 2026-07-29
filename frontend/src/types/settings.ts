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
  /** Factory-wide worker pool used by the feasibility check's capacity
   * scan alongside each machine's own capacity. Stored/sent as strings
   * (numeric text) like every other setting. */
  factory_total_workers: string
  factory_workday_hours: string
  /** 'true' or 'false' -- whether a passed/exception-approved feasibility
   * check automatically drafts a quotation. Admin/manager-only to change. */
  auto_create_quotation_from_feasibility: string
}

export type SettingsPayload = Partial<Settings>
