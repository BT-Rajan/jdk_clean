import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Alert, Button, GlassCard, Spinner, TextareaField, TextField } from '@/components/ui'
import { listEmailTemplates, updateEmailTemplate } from '@/api/emailTemplates'
import type { EmailTemplate } from '@/types/emailTemplate'
import { getApiErrorMessage } from '@/lib/apiError'
import { formatDateTime } from '@/lib/dateFormat'
import { emailTemplateSchema, type EmailTemplateFormValues } from '@/lib/validation'

function TemplateCard({ template, onSaved }: { template: EmailTemplate; onSaved: (t: EmailTemplate) => void }) {
  const [formError, setFormError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<EmailTemplateFormValues>({
    resolver: zodResolver(emailTemplateSchema),
    defaultValues: { subject: template.subject, body: template.body },
  })

  async function onSubmit(values: EmailTemplateFormValues) {
    setFormError(null)
    setNotice(null)
    try {
      const updated = await updateEmailTemplate(template.template_key, values)
      onSaved(updated)
      reset({ subject: updated.subject, body: updated.body })
      setNotice('Saved.')
    } catch (err) {
      setFormError(getApiErrorMessage(err))
    }
  }

  return (
    <GlassCard className="p-6">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-base font-medium text-white">{template.name}</h3>
        <span className="text-xs text-white/40">Last updated {formatDateTime(template.updated_at)}</span>
      </div>
      <p className="mb-4 text-xs text-white/40">
        Available placeholders: {template.placeholders.split(', ').map((p) => `{${p}}`).join(', ')} -- each is
        replaced with the real value when this email actually goes out; anything else is left as typed.
      </p>

      <Alert variant="error">{formError}</Alert>
      {notice && !isDirty && <p className="mb-4 text-sm text-emerald-300">{notice}</p>}

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
        <TextField label="Subject" error={errors.subject?.message} {...register('subject')} />
        <TextareaField label="Body" rows={8} error={errors.body?.message} {...register('body')} />
        <div className="flex justify-end">
          <Button type="submit" size="sm" isLoading={isSubmitting} disabled={!isDirty}>
            Save
          </Button>
        </div>
      </form>
    </GlassCard>
  )
}

export function EmailTemplatesTab() {
  const [templates, setTemplates] = useState<EmailTemplate[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listEmailTemplates()
      .then(setTemplates)
      .catch((err) => setError(getApiErrorMessage(err)))
  }, [])

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-white/50">
        The subject and body every automated or one-click document email goes out with. An order's own confirmation
        email fires automatically the first time it's confirmed, straight to the customer on file; a payment
        reminder sends whenever Sales clicks "Send payment request" on an order. Edit the text below -- the
        placeholders get filled in with that order's real details each time.
      </p>

      <Alert variant="error">{error}</Alert>

      {templates === null ? (
        <div className="flex justify-center py-12">
          <Spinner size={24} className="text-gold-300" />
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {templates.map((t) => (
            <TemplateCard
              key={t.template_key}
              template={t}
              onSaved={(updated) => setTemplates((prev) => prev!.map((p) => (p.template_key === updated.template_key ? updated : p)))}
            />
          ))}
        </div>
      )}
    </div>
  )
}
