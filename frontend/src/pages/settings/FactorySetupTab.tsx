import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Alert, Button, GlassCard, Spinner, TextField } from '@/components/ui'
import { getSettings, updateSettings } from '@/api/settings'
import type { Settings } from '@/types/settings'
import { getApiErrorMessage } from '@/lib/apiError'

const DAY_OPTIONS: { code: string; label: string }[] = [
  { code: 'Mon', label: 'Mon' },
  { code: 'Tue', label: 'Tue' },
  { code: 'Wed', label: 'Wed' },
  { code: 'Thu', label: 'Thu' },
  { code: 'Fri', label: 'Fri' },
  { code: 'Sat', label: 'Sat' },
  { code: 'Sun', label: 'Sun' },
]

type FactoryFields = Pick<Settings, 'factory_total_workers' | 'factory_workday_hours' | 'factory_working_days'>

function WorkingHoursCard() {
  const [loading, setLoading] = useState(true)
  const [formError, setFormError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const { register, handleSubmit, reset, watch, setValue, formState: { isSubmitting } } = useForm<FactoryFields>()
  const workingDays = (watch('factory_working_days') || '').split(',').map((d) => d.trim()).filter(Boolean)

  useEffect(() => {
    getSettings()
      .then((s) =>
        reset({
          factory_total_workers: s.factory_total_workers,
          factory_workday_hours: s.factory_workday_hours,
          factory_working_days: s.factory_working_days,
        }),
      )
      .catch((err) => setFormError(getApiErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [reset])

  function toggleWorkingDay(code: string) {
    const next = workingDays.includes(code)
      ? workingDays.filter((d) => d !== code)
      : [...workingDays, code]
    // Keep the stored order matching DAY_OPTIONS rather than click order,
    // so the string is stable/readable regardless of which day was toggled last.
    const ordered = DAY_OPTIONS.map((d) => d.code).filter((c) => next.includes(c))
    setValue('factory_working_days', ordered.join(','), { shouldDirty: true })
  }

  async function onSubmit(values: FactoryFields) {
    setFormError(null)
    setNotice(null)
    try {
      await updateSettings(values)
      setNotice('Saved.')
    } catch (err) {
      setFormError(getApiErrorMessage(err))
    }
  }

  return (
    <GlassCard className="p-8">
      <h2 className="font-display text-lg font-medium text-white">Weekdays &amp; working hours</h2>
      <p className="mt-1 text-sm text-white/50">
        The shared worker pool feasibility checks weigh against each product's "workers required" formula field,
        alongside the production line's own capacity. Every feasibility check's capacity estimate starts counting from the
        next working day after today (today itself is always left out) and skips whatever's off here.
      </p>
      <Alert variant="error">{formError}</Alert>
      {notice && (
        <div className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {notice}
        </div>
      )}
      {loading ? (
        <div className="flex justify-center py-8">
          <Spinner size={24} className="text-gold-300" />
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2">
            <TextField label="Total workers" type="number" step="1" min="0" {...register('factory_total_workers')} />
            <TextField
              label="Workday hours (per worker)"
              type="number"
              step="0.5"
              min="0"
              {...register('factory_workday_hours')}
            />
          </div>
          <div className="mt-6">
            <span className="text-sm font-medium text-white/80">Working days</span>
            <input type="hidden" {...register('factory_working_days')} />
            <div className="mt-3 flex flex-wrap gap-2">
              {DAY_OPTIONS.map((day) => {
                const active = workingDays.includes(day.code)
                return (
                  <button
                    key={day.code}
                    type="button"
                    onClick={() => toggleWorkingDay(day.code)}
                    className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                      active
                        ? 'border-gold-400 bg-gold-400/10 text-gold-200'
                        : 'border-white/10 text-white/50 hover:border-white/20 hover:text-white/80'
                    }`}
                  >
                    {day.label}
                  </button>
                )
              })}
            </div>
          </div>
          <div className="mt-6 flex justify-end">
            <Button type="submit" isLoading={isSubmitting}>Save</Button>
          </div>
        </form>
      )}
    </GlassCard>
  )
}

// Raw materials, Products, and Users used to each get a second,
// read-only preview table here (RawMaterialsCard/ProductsCard/UsersCard)
// duplicating the real Master Data list pages -- removed; find them
// under Master Data now (Materials -> Raw materials/Products,
// People & Organization -> Users).
export function FactorySetupTab() {
  return (
    <div className="flex flex-col gap-8">
      <WorkingHoursCard />
    </div>
  )
}
