/** Mirrors backend/app/schemas/sms_account.py. Admin-only. */

export type SmsProvider = 'kwtsms' | 'unifonic' | 'smsala' | 'custom'

export interface SmsAccount {
  id: number | null
  provider: SmsProvider
  sender_id: string
  api_url: string
  api_username: string
  /** Never the real secret itself -- just whether one is set. */
  has_secret: boolean
  test_mode: boolean
  is_active: boolean
  last_tested_at: string | null
  last_test_ok: boolean | null
  last_test_error: string | null
}

export interface SmsAccountFormValues {
  provider: SmsProvider
  sender_id: string
  api_url: string
  api_username: string
  /** Empty string = leave the saved secret untouched unless the user
   * explicitly opted to change it -- see SmsTab. */
  api_secret?: string
  test_mode: boolean
  is_active: boolean
}

export interface SmsProviderPreset {
  label: string
  api_url: string
  username_label: string
  secret_label: string
  note: string
}

export type SmsProviderPresets = Record<string, SmsProviderPreset>

export interface SmsTestResult {
  ok: boolean
  message: string
}
