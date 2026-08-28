import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Alert, Button, GlassCard, PasswordField, SelectField, Spinner, TextField } from '@/components/ui'
import { getEmailAccount, getEmailProviders, testEmailAccount, updateEmailAccount } from '@/api/communication'
import type { EmailAccount, EmailAccountFormValues, EmailProviderPresets } from '@/types/emailAccount'
import { getApiErrorMessage } from '@/lib/apiError'

export function EmailTab() {
  const [loading, setLoading] = useState(true)
  const [providers, setProviders] = useState<EmailProviderPresets>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [hasPassword, setHasPassword] = useState(false)
  const [changePassword, setChangePassword] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [lastTest, setLastTest] = useState<Pick<EmailAccount, 'last_tested_at' | 'last_test_ok' | 'last_test_error'>>({
    last_tested_at: null,
    last_test_ok: null,
    last_test_error: null,
  })

  const { register, watch, setValue, handleSubmit, reset, formState: { isSubmitting } } =
    useForm<EmailAccountFormValues>({
      defaultValues: {
        provider: 'gmail',
        incoming_protocol: 'imap',
        imap_use_ssl: true,
        pop3_use_ssl: true,
        smtp_use_tls: true,
        is_active: true,
      },
    })

  const provider = watch('provider')
  const incomingProtocol = watch('incoming_protocol')

  useEffect(() => {
    Promise.all([getEmailAccount(), getEmailProviders()])
      .then(([account, presets]) => {
        setProviders(presets)
        setHasPassword(account.has_password)
        setLastTest({
          last_tested_at: account.last_tested_at,
          last_test_ok: account.last_test_ok,
          last_test_error: account.last_test_error,
        })
        reset({
          provider: account.provider,
          email_address: account.email_address,
          display_name: account.display_name,
          username: account.username,
          incoming_protocol: account.incoming_protocol,
          imap_host: account.imap_host,
          imap_port: account.imap_port,
          imap_use_ssl: account.imap_use_ssl,
          pop3_host: account.pop3_host,
          pop3_port: account.pop3_port,
          pop3_use_ssl: account.pop3_use_ssl,
          smtp_host: account.smtp_host,
          smtp_port: account.smtp_port,
          smtp_use_tls: account.smtp_use_tls,
          is_active: account.is_active,
        })
      })
      .catch((err) => setFormError(getApiErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [reset])

  const currentPreset = providers[provider]

  function applyPreset(id: string) {
    const preset = providers[id]
    if (!preset) return
    setValue('imap_host', preset.imap_host)
    setValue('imap_port', preset.imap_port)
    setValue('imap_use_ssl', preset.imap_use_ssl)
    setValue('pop3_host', preset.pop3_host)
    setValue('pop3_port', preset.pop3_port)
    setValue('pop3_use_ssl', preset.pop3_use_ssl)
    setValue('smtp_host', preset.smtp_host)
    setValue('smtp_port', preset.smtp_port)
    setValue('smtp_use_tls', preset.smtp_use_tls)
  }

  async function onSubmit(values: EmailAccountFormValues) {
    setFormError(null)
    setNotice(null)
    setTestResult(null)
    try {
      const payload: EmailAccountFormValues = { ...values }
      if (!changePassword) {
        delete payload.password
      }
      const updated = await updateEmailAccount(payload)
      setHasPassword(updated.has_password)
      setChangePassword(false)
      setLastTest({
        last_tested_at: updated.last_tested_at,
        last_test_ok: updated.last_test_ok,
        last_test_error: updated.last_test_error,
      })
      setNotice('Email settings saved.')
    } catch (err) {
      setFormError(getApiErrorMessage(err))
    }
  }

  async function onTest() {
    setTesting(true)
    setTestResult(null)
    try {
      const result = await testEmailAccount()
      setTestResult(result)
      setLastTest({
        last_tested_at: new Date().toISOString(),
        last_test_ok: result.ok,
        last_test_error: result.ok ? null : result.message,
      })
    } catch (err) {
      setTestResult({ ok: false, message: getApiErrorMessage(err) })
    } finally {
      setTesting(false)
    }
  }

  const providerOptions = useMemo(() => Object.entries(providers), [providers])

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-8">
      <Alert variant="error">{formError}</Alert>
      <Alert variant="success">{notice}</Alert>

      <GlassCard className="p-8">
        <h2 className="font-display text-lg font-medium text-white">Mailbox</h2>
        <p className="mt-1 text-sm text-white/50">
          Pick a provider to fill in the standard server settings, then adjust anything if needed.
        </p>
        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <SelectField
            label="Provider"
            {...register('provider', {
              onChange: (e) => applyPreset(e.target.value),
            })}
          >
            {providerOptions.map(([id, preset]) => (
              <option key={id} value={id}>{preset.label}</option>
            ))}
          </SelectField>
          <TextField label="Email address" type="email" {...register('email_address')} />
          <TextField label="Display name" hint="Shown as the sender name on outgoing mail" {...register('display_name')} />
          <TextField label="Login username" hint="Leave blank to use the email address" {...register('username')} />
        </div>

        {currentPreset?.note ? (
          <p className="mt-4 text-xs text-gold-200/80">{currentPreset.note}</p>
        ) : null}

        <div className="mt-6">
          {hasPassword && !changePassword ? (
            <div className="flex items-center gap-3">
              <TextField label="Password" value="••••••••••••" disabled readOnly />
              <Button type="button" variant="ghost" size="sm" className="mt-6" onClick={() => setChangePassword(true)}>
                Change
              </Button>
            </div>
          ) : (
            <PasswordField
              label="Password"
              hint="App password recommended over your normal login password."
              {...register('password')}
            />
          )}
        </div>
      </GlassCard>

      <GlassCard className="p-8">
        <h2 className="font-display text-lg font-medium text-white">Incoming mail</h2>
        <p className="mt-1 text-sm text-white/50">Choose how this mailbox is read: IMAP or POP3.</p>

        <div className="mt-6 max-w-xs">
          <SelectField label="Protocol" {...register('incoming_protocol')}>
            <option value="imap">IMAP (recommended -- keeps mail in sync)</option>
            <option value="pop3">POP3 (downloads and removes from server)</option>
          </SelectField>
        </div>

        {incomingProtocol === 'imap' ? (
          <div className="mt-6 grid gap-6 sm:grid-cols-3">
            <TextField label="IMAP host" {...register('imap_host')} />
            <TextField label="IMAP port" type="number" {...register('imap_port', { valueAsNumber: true })} />
            <SelectField label="Encryption" {...register('imap_use_ssl', { setValueAs: (v) => v === 'true' })}>
              <option value="true">SSL/TLS</option>
              <option value="false">None</option>
            </SelectField>
          </div>
        ) : (
          <div className="mt-6 grid gap-6 sm:grid-cols-3">
            <TextField label="POP3 host" {...register('pop3_host')} />
            <TextField label="POP3 port" type="number" {...register('pop3_port', { valueAsNumber: true })} />
            <SelectField label="Encryption" {...register('pop3_use_ssl', { setValueAs: (v) => v === 'true' })}>
              <option value="true">SSL/TLS</option>
              <option value="false">None</option>
            </SelectField>
          </div>
        )}
      </GlassCard>

      <GlassCard className="p-8">
        <h2 className="font-display text-lg font-medium text-white">Outgoing mail (SMTP)</h2>
        <div className="mt-6 grid gap-6 sm:grid-cols-3">
          <TextField label="SMTP host" {...register('smtp_host')} />
          <TextField label="SMTP port" type="number" {...register('smtp_port', { valueAsNumber: true })} />
          <SelectField label="Encryption" {...register('smtp_use_tls', { setValueAs: (v) => v === 'true' })}>
            <option value="true">STARTTLS</option>
            <option value="false">None</option>
          </SelectField>
        </div>
      </GlassCard>

      <GlassCard className="p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-medium text-white">Status</h2>
            <p className="mt-1 text-sm text-white/50">
              {lastTest.last_tested_at
                ? `Last tested ${new Date(lastTest.last_tested_at).toLocaleString()} -- ${
                    lastTest.last_test_ok ? 'connected successfully' : lastTest.last_test_error
                  }`
                : 'Not tested yet.'}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="w-48">
              <SelectField label="Channel" {...register('is_active', { setValueAs: (v) => v === 'true' })}>
                <option value="true">Enabled</option>
                <option value="false">Disabled</option>
              </SelectField>
            </div>
            <Button type="button" variant="ghost" isLoading={testing} onClick={onTest}>
              Test connection
            </Button>
          </div>
        </div>
        {testResult ? (
          <Alert variant={testResult.ok ? 'success' : 'error'}>{testResult.message}</Alert>
        ) : null}
      </GlassCard>

      <div className="flex justify-end">
        <Button type="submit" isLoading={isSubmitting}>Save email settings</Button>
      </div>
    </form>
  )
}
