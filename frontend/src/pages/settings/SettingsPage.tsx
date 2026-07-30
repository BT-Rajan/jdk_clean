import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Navigate } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { PageContainer } from '@/components/layout/PageContainer'
import { Alert, Button, GlassCard, SelectField, Spinner, TextField } from '@/components/ui'
import { getSettings, updateSettings } from '@/api/settings'
import type { Settings } from '@/types/settings'
import { getApiErrorMessage } from '@/lib/apiError'
import { useAuth } from '@/hooks/useAuth'
import { isAdmin } from '@/lib/roles'

export function SettingsPage() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [formError, setFormError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm<Settings>()

  useEffect(() => {
    if (!isAdmin(user?.role)) return
    getSettings()
      .then(reset)
      .catch((err) => setFormError(getApiErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [reset, user?.role])

  // This page itself is admin-only, same boundary as the backend enforces
  // (see api/settings.py) -- redirect rather than show a permission error,
  // since nothing here is relevant to any other role.
  if (!isAdmin(user?.role)) {
    return <Navigate to="/dashboard" replace />
  }

  async function onSubmit(values: Settings) {
    setFormError(null)
    setNotice(null)
    try {
      const updated = await updateSettings(values)
      reset(updated)
      setNotice('Settings saved.')
    } catch (err) {
      setFormError(getApiErrorMessage(err))
    }
  }

  return (
    <AppLayout>
      <PageContainer>
        <h1 className="font-display text-2xl font-medium text-white">Settings</h1>
        <p className="mt-2 text-sm text-white/50">
          Company details used on outbound documents, and the AI provider used by the assistant.
        </p>

        {loading ? (
          <div className="flex justify-center py-16">
            <Spinner size={24} className="text-gold-300" />
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-8 flex flex-col gap-8">
            <Alert variant="error">{formError}</Alert>
            {notice && (
              <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                {notice}
              </div>
            )}

            <GlassCard className="p-8">
              <h2 className="font-display text-lg font-medium text-white">Company details</h2>
              <p className="mt-1 text-sm text-white/50">Appears on the letterhead of every generated PDF.</p>
              <div className="mt-6 flex flex-col gap-5">
                <TextField label="Company name" {...register('company_name')} />
                <TextField label="Address" {...register('company_address')} />
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <TextField label="Phone" {...register('company_phone')} />
                  <TextField label="Email" type="email" {...register('company_email')} />
                </div>
                <TextField label="Tax / GSTIN" {...register('company_gstin')} />
              </div>
            </GlassCard>

            <GlassCard className="p-8">
              <h2 className="font-display text-lg font-medium text-white">Factory</h2>
              <p className="mt-1 text-sm text-white/50">
                The shared worker pool feasibility checks weigh against each product's "workers required" formula
                field, alongside each machine's own capacity.
              </p>
              <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2">
                <TextField
                  label="Total workers"
                  type="number"
                  step="1"
                  min="0"
                  {...register('factory_total_workers')}
                />
                <TextField
                  label="Workday hours (per worker)"
                  type="number"
                  step="0.5"
                  min="0"
                  {...register('factory_workday_hours')}
                />
              </div>
            </GlassCard>

            <GlassCard className="p-8">
              <h2 className="font-display text-lg font-medium text-white">Sales workflow</h2>
              <p className="mt-1 text-sm text-white/50">
                When a feasibility check passes (or Sales overrides an infeasible result), the system can draft a
                quotation automatically -- pre-filled from the check's own lines, on the same deal -- instead of
                Sales creating one by hand. The draft is a completely normal quotation afterward: fully editable,
                and deletable if it's not wanted.
              </p>
              <div className="mt-6">
                <SelectField label="Auto-create quotation when feasibility passes" {...register('auto_create_quotation_from_feasibility')}>
                  <option value="true">On</option>
                  <option value="false">Off (Sales creates manually, as before)</option>
                </SelectField>
              </div>
            </GlassCard>

            <GlassCard className="p-8">
              <h2 className="font-display text-lg font-medium text-white">Production workflow</h2>
              <p className="mt-1 text-sm text-white/50">
                When an order is confirmed, the system can schedule a production batch automatically for each line
                whose product has a machine and hours-per-unit set (its "formula") -- picking the earliest date that
                machine actually has free capacity, the same way the feasibility check does. Lines without a formula
                are left for Sales/Production to schedule by hand, same as today.
              </p>
              <div className="mt-6">
                <SelectField label="Auto-schedule production when order is confirmed" {...register('auto_schedule_production_on_order_confirm')}>
                  <option value="true">On</option>
                  <option value="false">Off (schedule manually, as before)</option>
                </SelectField>
              </div>
            </GlassCard>

            <GlassCard className="p-8">
              <h2 className="font-display text-lg font-medium text-white">Delivery workflow</h2>
              <p className="mt-1 text-sm text-white/50">
                When an order becomes ready to ship -- whether set directly, or automatically once every batch
                producing it has completed -- the system can draft a delivery note for it right away, dated today
                and pre-filled with the order's own lines, instead of Sales or Warehouse creating one by hand.
              </p>
              <div className="mt-6">
                <SelectField label="Auto-create delivery note when order is ready to ship" {...register('auto_create_delivery_note_on_ready_to_ship')}>
                  <option value="true">On</option>
                  <option value="false">Off (create manually, as before)</option>
                </SelectField>
              </div>
            </GlassCard>

            <GlassCard className="p-8">
              <h2 className="font-display text-lg font-medium text-white">AI assistant provider</h2>
              <p className="mt-1 text-sm text-white/50">
                Visible here only -- the assistant itself never names a provider anywhere else in the app.
              </p>
              <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2">
                <SelectField label="Provider" {...register('ai_provider')}>
                  <option value="">Not configured</option>
                  <option value="claude">Claude (Anthropic)</option>
                  <option value="deepseek">DeepSeek</option>
                </SelectField>
                <TextField
                  label="API key"
                  type="password"
                  hint="Leave the masked value in place to keep the current key"
                  {...register('ai_api_key')}
                />
              </div>
            </GlassCard>

            <div className="flex justify-end">
              <Button type="submit" isLoading={isSubmitting}>Save settings</Button>
            </div>
          </form>
        )}
      </PageContainer>
    </AppLayout>
  )
}
