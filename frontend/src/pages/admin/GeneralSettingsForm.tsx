import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { useForm } from 'react-hook-form'
import { Alert, Button, GlassCard, SelectField, Spinner, TabPanel, TextField } from '@/components/ui'
import { deleteCompanyLogo, fetchCompanyLogoBlob, getSettings, updateSettings, uploadCompanyLogo } from '@/api/settings'
import { LOGO_VARIANTS, type LogoVariant, type Settings } from '@/types/settings'
import { getApiErrorMessage } from '@/lib/apiError'
import type { GeneralSectionKey } from './sections'

export type { GeneralSectionKey } from './sections'

const LOGO_LABELS: Record<LogoVariant, string> = {
  dark_english: 'Dark · English',
  dark_arabic: 'Dark · Arabic',
  light_english: 'Light · English',
  light_arabic: 'Light · Arabic',
}

const MAX_LOGO_BYTES = 5 * 1024 * 1024
const ALLOWED_LOGO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

type LogoFilenames = Record<LogoVariant, string>

function logoFilenamesFrom(settings: Settings): LogoFilenames {
  return {
    dark_english: settings.company_logo_dark_english_filename,
    dark_arabic: settings.company_logo_dark_arabic_filename,
    light_english: settings.company_logo_light_english_filename,
    light_arabic: settings.company_logo_light_arabic_filename,
  }
}

interface LogoSlotProps {
  variant: LogoVariant
  filename: string
  onChange: (updated: Settings) => void
}

/** One upload/preview/remove slot for a single logo variant. Uploads and
 * removals commit immediately through their own endpoints (like
 * AvatarEditor's photo upload) rather than waiting on this form's Save
 * button -- there's no "unsaved" state for a logo file itself, only for
 * which one is marked active (see the "Active logo" select below). */
function LogoSlot({ variant, filename, onChange }: LogoSlotProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [dimensions, setDimensions] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [isRemoving, setIsRemoving] = useState(false)

  useEffect(() => {
    if (!filename) {
      setObjectUrl(null)
      setDimensions(null)
      return
    }

    let cancelled = false
    let currentUrl: string | null = null

    fetchCompanyLogoBlob(variant)
      .then((blob) => {
        if (cancelled) return
        currentUrl = URL.createObjectURL(blob)
        setObjectUrl(currentUrl)
      })
      .catch(() => {
        if (!cancelled) setObjectUrl(null)
      })

    return () => {
      cancelled = true
      if (currentUrl) URL.revokeObjectURL(currentUrl)
    }
  }, [variant, filename])

  function validate(file: File): string | null {
    if (!ALLOWED_LOGO_TYPES.has(file.type)) {
      return 'Please choose a JPEG, PNG, or WEBP image.'
    }
    if (file.size > MAX_LOGO_BYTES) {
      return 'Image must be under 5 MB.'
    }
    return null
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = '' // allow re-selecting the same file later
    if (!file) return

    const validationError = validate(file)
    if (validationError) {
      setError(validationError)
      return
    }

    setError(null)
    setIsUploading(true)
    try {
      const updated = await uploadCompanyLogo(variant, file)
      onChange(updated)
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setIsUploading(false)
    }
  }

  async function handleRemove() {
    setError(null)
    setIsRemoving(true)
    try {
      const updated = await deleteCompanyLogo(variant)
      onChange(updated)
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setIsRemoving(false)
    }
  }

  return (
    <div className="glass-inset flex flex-col gap-3 rounded-xl p-4">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-white/55">{LOGO_LABELS[variant]}</p>

      <div className="flex h-20 items-center justify-center rounded-lg bg-[repeating-conic-gradient(#2a2a2a_0%_25%,#1a1a1a_0%_50%)] bg-[length:16px_16px]">
        {objectUrl ? (
          <img
            src={objectUrl}
            alt={`${LOGO_LABELS[variant]} logo`}
            className="max-h-full max-w-full object-contain p-2"
            onLoad={(event) => {
              const img = event.currentTarget
              setDimensions(`${img.naturalWidth} × ${img.naturalHeight}px`)
            }}
          />
        ) : (
          <span className="text-xs text-white/30">No logo uploaded</span>
        )}
      </div>

      {dimensions && <p className="text-[11px] text-white/40">{dimensions}</p>}
      <Alert variant="error">{error}</Alert>

      <div className="flex gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleFileChange}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          isLoading={isUploading}
          onClick={() => fileInputRef.current?.click()}
        >
          {filename ? 'Replace' : 'Upload'}
        </Button>
        {filename && (
          <Button type="button" variant="subtle" size="sm" isLoading={isRemoving} onClick={handleRemove}>
            Remove
          </Button>
        )}
      </div>
    </div>
  )
}

interface GeneralSettingsFormProps {
  /** Which of this form's own four sections to show. Mounted for the
   * lifetime of the admin shell regardless of which top-level sidebar
   * section is active elsewhere, so unsaved edits here are never lost
   * by clicking over to Email or Users and back -- see AdminShell. */
  activeSection: GeneralSectionKey
}

export function GeneralSettingsForm({ activeSection }: GeneralSettingsFormProps) {
  const [loading, setLoading] = useState(true)
  const [formError, setFormError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [logoFilenames, setLogoFilenames] = useState<LogoFilenames>({
    dark_english: '',
    dark_arabic: '',
    light_english: '',
    light_arabic: '',
  })

  const { register, handleSubmit, reset, setValue, formState: { isSubmitting } } = useForm<Settings>()

  useEffect(() => {
    getSettings()
      .then((data) => {
        reset(data)
        setLogoFilenames(logoFilenamesFrom(data))
      })
      .catch((err) => setFormError(getApiErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [reset])

  // A logo upload/removal commits immediately (see LogoSlot) rather than
  // through this form's Save button, so its result is applied straight
  // to local state/RHF here instead of waiting for onSubmit. Only
  // company_logo_active is touched via setValue -- a delete can clear it
  // server-side (see company_logo_service.delete_logo) when the removed
  // variant was the active one, and the visible dropdown needs to catch
  // up without discarding any other unsaved edits elsewhere in the form.
  function handleLogoChange(updated: Settings) {
    setLogoFilenames(logoFilenamesFrom(updated))
    setValue('company_logo_active', updated.company_logo_active)
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

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size={24} className="text-gold-300" />
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-8">
      <Alert variant="error">{formError}</Alert>
      <Alert variant="success">{notice}</Alert>

      <TabPanel id="company" activeId={activeSection} keepMounted className="flex flex-col gap-8">
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
          </div>
        </GlassCard>

        <GlassCard className="p-8">
          <h2 className="font-display text-lg font-medium text-white">Company logo</h2>
          <p className="mt-1 text-sm text-white/50">
            Upload a logo for each combination of theme and language, then pick which one is active. Any
            image size works for now -- fixed dimensions can be enforced later once the print/display
            requirements are settled.
          </p>
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {LOGO_VARIANTS.map((variant) => (
              <LogoSlot key={variant} variant={variant} filename={logoFilenames[variant]} onChange={handleLogoChange} />
            ))}
          </div>
          <div className="mt-6 max-w-xs">
            <SelectField label="Active logo" {...register('company_logo_active')}>
              <option value="">None selected</option>
              {LOGO_VARIANTS.filter((variant) => logoFilenames[variant]).map((variant) => (
                <option key={variant} value={variant}>
                  {LOGO_LABELS[variant]}
                </option>
              ))}
            </SelectField>
          </div>
        </GlassCard>
      </TabPanel>

      <TabPanel id="approvals" activeId={activeSection} keepMounted className="flex flex-col gap-8">
        <GlassCard className="p-8">
          <h2 className="font-display text-lg font-medium text-white">Large purchase order approval</h2>
          <p className="mt-1 text-sm text-white/50">
            A purchase order at or above this amount (in KWD) can't be sent to its supplier until an admin approves
            it. Leave blank to turn this off entirely. This is the factory-wide default -- a trusted supplier can be
            given its own ceiling instead from that supplier's own page, which then applies in place of this number.
          </p>
          <div className="mt-6">
            <TextField
              label="Approval threshold (KWD)"
              type="number"
              step="0.01"
              min="0"
              placeholder="No threshold set -- approval not required"
              {...register('large_po_approval_threshold')}
            />
          </div>
        </GlassCard>

        <GlassCard className="p-8">
          <h2 className="font-display text-lg font-medium text-white">Large discount approval</h2>
          <p className="mt-1 text-sm text-white/50">
            A quotation, order, or purchase order with a discount (document-level or any single line's) at or
            above this percentage can't leave draft until an admin approves it. Leave blank to turn this off
            entirely. This is the factory-wide default -- an individual customer or supplier can be given its own
            threshold instead from that customer's/supplier's own page, which then applies in place of this number.
          </p>
          <div className="mt-6">
            <TextField
              label="Approval threshold (%)"
              type="number"
              step="0.01"
              min="0"
              max="100"
              placeholder="No threshold set -- approval not required"
              {...register('large_discount_approval_threshold')}
            />
          </div>
        </GlassCard>
      </TabPanel>

      <TabPanel id="ai-assistant" activeId={activeSection} keepMounted className="flex flex-col gap-8">
        <GlassCard className="p-8">
          <h2 className="font-display text-lg font-medium text-white">AI assistant</h2>
          <p className="mt-1 text-sm text-white/50">
            Paste a Claude or DeepSeek API key -- which provider it is gets detected automatically from the key
            itself, nothing else to pick here.
          </p>
          <div className="mt-6">
            <TextField
              label="API key"
              type="password"
              hint="Leave the masked value in place to keep the current key"
              {...register('ai_api_key')}
            />
          </div>
        </GlassCard>
      </TabPanel>

      <div className="flex justify-end">
        <Button type="submit" isLoading={isSubmitting}>Save settings</Button>
      </div>
    </form>
  )
}
