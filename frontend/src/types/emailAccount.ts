/** Mirrors backend/app/schemas/email_account.py. Admin-only. */

export type IncomingProtocol = 'imap' | 'pop3'

export interface EmailAccount {
  id: number | null
  provider: string
  email_address: string
  display_name: string
  username: string
  /** Never the real/masked password itself -- just whether one is set. */
  has_password: boolean
  incoming_protocol: IncomingProtocol
  imap_host: string
  imap_port: number
  imap_use_ssl: boolean
  pop3_host: string
  pop3_port: number
  pop3_use_ssl: boolean
  smtp_host: string
  smtp_port: number
  smtp_use_tls: boolean
  is_active: boolean
  last_tested_at: string | null
  last_test_ok: boolean | null
  last_test_error: string | null
}

export interface EmailAccountFormValues {
  provider: string
  email_address: string
  display_name: string
  username: string
  /** Empty string = leave the saved password untouched (mirrors the
   * masked ai_api_key convention) unless the user explicitly typed a
   * new one via the "change password" toggle -- see EmailTab. */
  password?: string
  incoming_protocol: IncomingProtocol
  imap_host: string
  imap_port: number
  imap_use_ssl: boolean
  pop3_host: string
  pop3_port: number
  pop3_use_ssl: boolean
  smtp_host: string
  smtp_port: number
  smtp_use_tls: boolean
  is_active: boolean
}

export interface EmailProviderPreset {
  label: string
  imap_host: string
  imap_port: number
  imap_use_ssl: boolean
  pop3_host: string
  pop3_port: number
  pop3_use_ssl: boolean
  smtp_host: string
  smtp_port: number
  smtp_use_tls: boolean
  note: string
}

export type EmailProviderPresets = Record<string, EmailProviderPreset>

export interface EmailAccountTestResult {
  ok: boolean
  message: string
}
