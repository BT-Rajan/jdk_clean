import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Alert, Button, GlassCard, PasswordField, SelectField, Spinner, TextField } from '@/components/ui'
import { getSmsAccount, getSmsProviders, testSmsAccount, updateSmsAccount } from '@/api/communication'
import type { SmsAccount, SmsAccountFormValues, SmsProviderPresets } from '@/types/smsAccount'
import { getApiErrorMessage } from '@/lib/apiError'

export function SmsTab() {
  const [loading, setLoading] = useState(true)
  const [providers, setProviders] = useState<SmsProviderPresets>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [hasSecret, setHasSecret] = useState(false)
  const [changeSecret, setChangeSecret] = useState(false)
  const [testPhone, setTestPhone] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [lastTest, setLastTest] = useState<Pick<SmsAccount, 'last_tested_at' | 'last_test_ok' | 'last_test_error'>>({
    last_tested_at: null,
    last_test_ok: null,
    last_test_error: null,
  })

  const { register, watch, setValue, handleSubmit, reset, formState: { isSubmitting } } =
    useForm<SmsAccountFormValues>({
      defaultValues: {
        provider: 'kwtsms',
        test_mode: true,
        is_active: true,
      },
    })

  const provider = watch('provider')
  const testMode = watch('test_mode')
  const isActive = watch('is_active')

  useEffect(() => {
    Promise.all([getSmsAccount(), getSmsProviders()])
      .then(([account, presets]) => {
        setProviders(presets)
        setHasSecret(account.has_secret)
        setLastTest({
          last_tested_at: account.last_tested_at,
          last_test_ok: account.last_test_ok,
          last_test_error: account.last_test_error,
        })
        reset({
          provider: account.provider,
          sender_id: account.sender_id,
          api_url: account.api_url,
          api_username: account.api_username,
          test_mode: account.test_mode,
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
    setValue('api_url', preset.api_url)
  }

  async function onSubmit(values: SmsAccountFormValues) {
    setFormError(null)
    setNotice(null)
    setTestResult(null)
    try {
      const payload: SmsAccountFormValues = { ...values }
      if (!changeSecret) {
        delete payload.api_secret
      }
      const updated = await updateSmsAccount(payload)
      setHasSecret(updated.has_secret)
      setChangeSecret(false)
      setLastTest({
        last_tested_at: updated.last_tested_at,
        last_test_ok: updated.last_test_ok,
        last_test_error: updated.last_test_error,
      })
      setNotice('SMS settings saved.')
    } catch (err) {
      setFormError(getApiErrorMessage(err))
    }
  }

  async function onTest() {
    if (!testPhone.trim()) {
      setTestResult({ ok: false, message: 'Enter a phone number to send the test to.' })
      return
    }
    setTesting(true)
    setTestResult(null)
    try {
      const result = await testSmsAccount(testPhone.trim())
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
        <h2 className="font-display text-lg font-medium text-white">Bulk SMS gateway</h2>
        <p className="mt-1 text-sm text-white/50">
          Pick an operator to fill in its API URL, then adjust anything if needed. kwtSMS is Kuwait's own dedicated
          gateway and is used by default -- Unifonic and SMSala are also common choices for businesses sending bulk
          SMS in Kuwait.
        </p>
        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <SelectField
            label="Operator"
            {...register('provider', {
              onChange: (e) => applyPreset(e.target.value),
            })}
          >
            {providerOptions.map(([id, preset]) => (
              <option key={id} value={id}>{preset.label}</option>
            ))}
          </SelectField>
          <TextField
            label="Sender ID"
            hint="The name/number recipients see as the sender. Must be pre-registered with your operator."
            {...register('sender_id')}
          />
        </div>

        {currentPreset?.note ? (
          <p className="mt-4 text-xs text-gold-200/80">{currentPreset.note}</p>
        ) : null}

        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <TextField label="API URL" {...register('api_url')} />
          <TextField label={currentPreset?.username_label ?? 'Username'} {...register('api_username')} />
        </div>

        <div className="mt-6 max-w-md">
          {hasSecret && !changeSecret ? (
            <div className="flex items-center gap-3">
              <TextField label={currentPreset?.secret_label ?? 'Secret'} value="••••••••••••" disabled readOnly />
              <Button type="button" variant="ghost" size="sm" className="mt-6" onClick={() => setChangeSecret(true)}>
                Change
              </Button>
            </div>
          ) : (
            <PasswordField label={currentPreset?.secret_label ?? 'Secret'} {...register('api_secret')} />
          )}
        </div>

        {provider === 'kwtsms' && (
          <div className="mt-6 max-w-xs">
            <SelectField
              label="Test mode"
              value={testMode ? 'true' : 'false'}
              {...register('test_mode', { setValueAs: (v) => v === 'true' })}
            >
              <option value="true">On -- messages are queued, not delivered</option>
              <option value="false">Off -- messages deliver for real</option>
            </SelectField>
          </div>
        )}
      </GlassCard>

      <GlassCard className="p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-medium text-white">Status</h2>
            <p className="mt-1 text-sm text-white/50">
              {lastTest.last_tested_at
                ? `Last tested ${new Date(lastTest.last_tested_at).toLocaleString()} -- ${
                    lastTest.last_test_ok ? 'sent successfully' : lastTest.last_test_error
                  }`
                : 'Not tested yet.'}
            </p>
          </div>
          <div className="w-48">
            <SelectField
              label="Channel"
              value={isActive ? 'true' : 'false'}
              {...register('is_active', { setValueAs: (v) => v === 'true' })}
            >
              <option value="true">Enabled</option>
              <option value="false">Disabled</option>
            </SelectField>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-end gap-4">
          <div className="w-56">
            <TextField
              label="Test phone number"
              placeholder="965XXXXXXXX"
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
            />
          </div>
          <Button type="button" variant="ghost" isLoading={testing} onClick={onTest}>
            Send test SMS
          </Button>
        </div>
        <p className="mt-2 text-xs text-white/40">
          {provider === 'kwtsms' && watch('test_mode')
            ? "With test mode on, this queues a message but won't actually deliver it."
            : 'This sends a real SMS and uses your operator credit.'}
        </p>
        {testResult ? (
          <Alert variant={testResult.ok ? 'success' : 'error'}>{testResult.message}</Alert>
        ) : null}
      </GlassCard>

      <div className="flex justify-end">
        <Button type="submit" isLoading={isSubmitting}>Save SMS settings</Button>
      </div>
    </form>
  )
}
