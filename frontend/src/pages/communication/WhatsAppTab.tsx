import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Alert, Button, GlassCard, PasswordField, SelectField, Spinner, TextField } from '@/components/ui'
import {
  getWhatsAppAccount,
  getWhatsAppTemplates,
  sendWhatsAppTestTemplate,
  testWhatsAppAccount,
  updateWhatsAppAccount,
} from '@/api/communication'
import type { WhatsAppAccount, WhatsAppAccountFormValues, WhatsAppTemplate } from '@/types/whatsappAccount'
import { getApiErrorMessage } from '@/lib/apiError'

export function WhatsAppTab() {
  const [loading, setLoading] = useState(true)
  const [formError, setFormError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [hasToken, setHasToken] = useState(false)
  const [changeToken, setChangeToken] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [lastTest, setLastTest] = useState<Pick<WhatsAppAccount, 'last_tested_at' | 'last_test_ok' | 'last_test_error'>>({
    last_tested_at: null,
    last_test_ok: null,
    last_test_error: null,
  })
  const [identity, setIdentity] = useState<Pick<WhatsAppAccount, 'display_phone_number' | 'verified_name'>>({
    display_phone_number: '',
    verified_name: '',
  })

  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([])
  const [templatesError, setTemplatesError] = useState<string | null>(null)
  const [selectedTemplate, setSelectedTemplate] = useState('')
  const [bodyParams, setBodyParams] = useState<string[]>([])
  const [sendTo, setSendTo] = useState('')
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState<{ ok: boolean; message: string } | null>(null)

  const { register, handleSubmit, reset, formState: { isSubmitting } } =
    useForm<WhatsAppAccountFormValues>({
      defaultValues: { api_version: 'v21.0', is_active: true },
    })

  function loadTemplates() {
    setTemplatesError(null)
    getWhatsAppTemplates()
      .then((list) => {
        setTemplates(list)
        if (list.length && !selectedTemplate) {
          setSelectedTemplate(`${list[0].name}::${list[0].language}`)
        }
      })
      .catch((err) => setTemplatesError(getApiErrorMessage(err)))
  }

  useEffect(() => {
    getWhatsAppAccount()
      .then((account) => {
        setHasToken(account.has_token)
        setIdentity({ display_phone_number: account.display_phone_number, verified_name: account.verified_name })
        setLastTest({
          last_tested_at: account.last_tested_at,
          last_test_ok: account.last_test_ok,
          last_test_error: account.last_test_error,
        })
        reset({
          phone_number_id: account.phone_number_id,
          waba_id: account.waba_id,
          api_version: account.api_version,
          is_active: account.is_active,
        })
        if (account.has_token && account.waba_id) loadTemplates()
      })
      .catch((err) => setFormError(getApiErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [reset])

  async function onSubmit(values: WhatsAppAccountFormValues) {
    setFormError(null)
    setNotice(null)
    setTestResult(null)
    try {
      const payload: WhatsAppAccountFormValues = { ...values }
      if (!changeToken) {
        delete payload.access_token
      }
      const updated = await updateWhatsAppAccount(payload)
      setHasToken(updated.has_token)
      setChangeToken(false)
      setIdentity({ display_phone_number: updated.display_phone_number, verified_name: updated.verified_name })
      setLastTest({
        last_tested_at: updated.last_tested_at,
        last_test_ok: updated.last_test_ok,
        last_test_error: updated.last_test_error,
      })
      setNotice('WhatsApp settings saved.')
    } catch (err) {
      setFormError(getApiErrorMessage(err))
    }
  }

  async function onTest() {
    setTesting(true)
    setTestResult(null)
    try {
      const result = await testWhatsAppAccount()
      setTestResult(result)
      setLastTest({
        last_tested_at: new Date().toISOString(),
        last_test_ok: result.ok,
        last_test_error: result.ok ? null : result.message,
      })
      if (result.ok) {
        const account = await getWhatsAppAccount()
        setIdentity({ display_phone_number: account.display_phone_number, verified_name: account.verified_name })
        loadTemplates()
      }
    } catch (err) {
      setTestResult({ ok: false, message: getApiErrorMessage(err) })
    } finally {
      setTesting(false)
    }
  }

  const currentTemplate = templates.find((t) => `${t.name}::${t.language}` === selectedTemplate)
  const bodyComponent = currentTemplate?.components.find((c) => c.type.toLowerCase() === 'body')
  const variableCount = bodyComponent?.variable_count ?? 0

  function onSelectTemplate(key: string) {
    setSelectedTemplate(key)
    const tpl = templates.find((t) => `${t.name}::${t.language}` === key)
    const count = tpl?.components.find((c) => c.type.toLowerCase() === 'body')?.variable_count ?? 0
    setBodyParams(Array.from({ length: count }, () => ''))
  }

  async function onSendTest() {
    if (!currentTemplate) {
      setSendResult({ ok: false, message: 'Pick an approved template first.' })
      return
    }
    if (!sendTo.trim()) {
      setSendResult({ ok: false, message: 'Enter a phone number to send the test to.' })
      return
    }
    setSending(true)
    setSendResult(null)
    try {
      const result = await sendWhatsAppTestTemplate({
        to: sendTo.trim(),
        template_name: currentTemplate.name,
        language: currentTemplate.language,
        body_params: bodyParams,
      })
      setSendResult(result)
    } catch (err) {
      setSendResult({ ok: false, message: getApiErrorMessage(err) })
    } finally {
      setSending(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-8">
      <Alert variant="info">
        This channel only ever sends Meta-approved templates -- there is no free-form message option here. Templates
        are fetched live from your WhatsApp Business Account below, never typed in by hand.
      </Alert>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-8">
        <Alert variant="error">{formError}</Alert>
        <Alert variant="success">{notice}</Alert>

        <GlassCard className="p-8">
          <h2 className="font-display text-lg font-medium text-white">Meta WhatsApp Business Cloud API</h2>
          <p className="mt-1 text-sm text-white/50">
            From Meta Business Suite: a System User access token scoped to whatsapp_business_messaging and
            whatsapp_business_management, plus the Phone Number ID and WhatsApp Business Account (WABA) ID.
          </p>
          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            <TextField label="Phone Number ID" {...register('phone_number_id')} />
            <TextField label="WhatsApp Business Account ID (WABA ID)" {...register('waba_id')} />
            <TextField label="Graph API version" hint="e.g. v21.0" {...register('api_version')} />
          </div>

          <div className="mt-6 max-w-md">
            {hasToken && !changeToken ? (
              <div className="flex items-center gap-3">
                <TextField label="Access token" value="••••••••••••" disabled readOnly />
                <Button type="button" variant="ghost" size="sm" className="mt-6" onClick={() => setChangeToken(true)}>
                  Change
                </Button>
              </div>
            ) : (
              <PasswordField
                label="Access token"
                hint="System User token, generated in Meta Business Suite. Set it to never expire to avoid 60-day rotation."
                {...register('access_token')}
              />
            )}
          </div>

          {(identity.verified_name || identity.display_phone_number) && (
            <p className="mt-4 text-xs text-white/50">
              Verified as <span className="text-white/80">{identity.verified_name}</span>
              {identity.display_phone_number ? ` (${identity.display_phone_number})` : ''}
            </p>
          )}
        </GlassCard>

        <GlassCard className="p-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-lg font-medium text-white">Status</h2>
              <p className="mt-1 text-sm text-white/50">
                {lastTest.last_tested_at
                  ? `Last checked ${new Date(lastTest.last_tested_at).toLocaleString()} -- ${
                      lastTest.last_test_ok ? 'credentials OK' : lastTest.last_test_error
                    }`
                  : 'Not checked yet.'}
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
                Check credentials
              </Button>
            </div>
          </div>
          <p className="mt-2 text-xs text-white/40">Read-only -- this looks up the number's own record on Meta and sends nothing.</p>
          {testResult ? <Alert variant={testResult.ok ? 'success' : 'error'}>{testResult.message}</Alert> : null}
        </GlassCard>

        <div className="flex justify-end">
          <Button type="submit" isLoading={isSubmitting}>Save WhatsApp settings</Button>
        </div>
      </form>

      <GlassCard className="p-8">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-medium text-white">Send a test template</h2>
            <p className="mt-1 text-sm text-white/50">Only templates Meta has approved for this account show up here.</p>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={loadTemplates}>Refresh templates</Button>
        </div>

        {templatesError ? <Alert variant="error">{templatesError}</Alert> : null}

        {templates.length === 0 && !templatesError ? (
          <p className="mt-6 text-sm text-white/50">
            No approved templates found yet. Save valid credentials above, create/approve a template in Meta Business
            Suite, then refresh.
          </p>
        ) : (
          <>
            <div className="mt-6 grid gap-6 sm:grid-cols-2">
              <SelectField
                label="Approved template"
                value={selectedTemplate}
                onChange={(e) => onSelectTemplate(e.target.value)}
              >
                {templates.map((t) => (
                  <option key={`${t.name}::${t.language}`} value={`${t.name}::${t.language}`}>
                    {t.name} ({t.language}) -- {t.category}
                  </option>
                ))}
              </SelectField>
              <TextField
                label="Send to (WhatsApp number)"
                placeholder="965XXXXXXXX"
                value={sendTo}
                onChange={(e) => setSendTo(e.target.value)}
              />
            </div>

            {bodyComponent?.text ? (
              <p className="mt-4 rounded-lg bg-white/5 p-4 text-sm text-white/70">{bodyComponent.text}</p>
            ) : null}

            {variableCount > 0 && (
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                {Array.from({ length: variableCount }, (_, i) => (
                  <TextField
                    key={i}
                    label={`Body variable {{${i + 1}}}`}
                    value={bodyParams[i] ?? ''}
                    onChange={(e) => {
                      const next = [...bodyParams]
                      next[i] = e.target.value
                      setBodyParams(next)
                    }}
                  />
                ))}
              </div>
            )}

            <div className="mt-6 flex justify-end">
              <Button type="button" isLoading={sending} onClick={onSendTest}>Send test message</Button>
            </div>
            {sendResult ? <Alert variant={sendResult.ok ? 'success' : 'error'}>{sendResult.message}</Alert> : null}
          </>
        )}
      </GlassCard>
    </div>
  )
}
