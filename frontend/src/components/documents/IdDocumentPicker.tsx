import { useRef } from 'react'
import { Button } from '@/components/ui'

const ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf'
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
export const ID_DOCUMENT_MAX_BYTES = 8 * 1024 * 1024

interface IdDocumentPickerProps {
  label: string
  hint?: string
  value: File | null
  onChange: (file: File | null) => void
  /** Filename already on file server-side (edit context only) -- shown
   * so replacing it is an informed choice, not a guess. */
  existingFilename?: string | null
  error?: string | null
  onError?: (message: string | null) => void
}

/** Local file selection for an id document (image or PDF) -- used inside
 * both onboarding wizards (where the entity doesn't exist yet, so the
 * actual upload has to wait until after creation) and both edit forms.
 * Purely presentational: validates type/size and hands the chosen File
 * up to the caller, who decides when/how to actually upload it. */
export function IdDocumentPicker({
  label,
  hint,
  value,
  onChange,
  existingFilename,
  error,
  onError,
}: IdDocumentPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    if (!ALLOWED_TYPES.has(file.type)) {
      onError?.('Please choose a JPEG, PNG, or WEBP image, or a PDF.')
      return
    }
    if (file.size > ID_DOCUMENT_MAX_BYTES) {
      onError?.('File must be under 8 MB.')
      return
    }
    onError?.(null)
    onChange(file)
  }

  return (
    <div className="w-full">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.14em] text-white/55">{label}</span>
      <input ref={inputRef} type="file" accept={ACCEPT} className="hidden" onChange={handleFileChange} />
      <div className="glass-inset flex flex-wrap items-center gap-3 rounded-xl px-4 py-3">
        <Button type="button" variant="ghost" size="sm" onClick={() => inputRef.current?.click()}>
          {value ? 'Choose a different file' : 'Choose file'}
        </Button>
        <span className="text-sm text-white/50">
          {value ? value.name : existingFilename ? 'A document is already on file.' : 'No file chosen'}
        </span>
        {value && (
          <Button type="button" variant="subtle" size="sm" onClick={() => onChange(null)}>
            Remove selection
          </Button>
        )}
      </div>
      {error ? (
        <p role="alert" className="mt-1.5 text-xs text-red-400">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-white/40">{hint}</p>
      ) : null}
    </div>
  )
}
