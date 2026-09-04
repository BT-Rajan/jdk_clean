import { useRef, useState } from 'react'
import { Alert, Button, GlassCard } from '@/components/ui'
import { formatDate } from '@/lib/dateFormat'
import { ID_DOCUMENT_MAX_BYTES } from './IdDocumentPicker'

const ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf'
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])

interface IdDocumentPanelProps {
  hasDocument: boolean
  verified: boolean
  verifiedAt: string | null
  canEdit: boolean
  canVerify: boolean
  onUpload: (file: File) => Promise<void>
  onRemove: () => Promise<void>
  onView: () => Promise<void>
  onVerify: () => Promise<void>
  onUnverify: () => Promise<void>
}

/** Detail-page panel for an entity's uploaded id document (image or
 * PDF) -- view/replace/remove it, and (write-permission only) mark it
 * verified. Used identically by CustomerDetailPage and
 * SupplierDetailPage; every actual API call is passed in so this stays
 * agnostic of which entity it's attached to. */
export function IdDocumentPanel({
  hasDocument,
  verified,
  verifiedAt,
  canEdit,
  canVerify,
  onUpload,
  onRemove,
  onView,
  onVerify,
  onUnverify,
}: IdDocumentPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function withBusy(fn: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!ALLOWED_TYPES.has(file.type)) {
      setError('Please choose a JPEG, PNG, or WEBP image, or a PDF.')
      return
    }
    if (file.size > ID_DOCUMENT_MAX_BYTES) {
      setError('File must be under 8 MB.')
      return
    }
    void withBusy(() => onUpload(file))
  }

  return (
    <GlassCard className="p-6">
      <Alert variant="error">{error}</Alert>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-base font-medium text-white">Id document</h2>
          <p className="mt-1 text-sm text-white/50">
            {hasDocument
              ? verified
                ? `Verified${verifiedAt ? ` on ${formatDate(verifiedAt)}` : ''}.`
                : 'On file, not yet verified.'
              : 'No document uploaded yet.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {hasDocument && (
            <Button variant="ghost" size="sm" isLoading={busy} onClick={() => withBusy(onView)}>
              View
            </Button>
          )}
          {canEdit && (
            <>
              <input ref={inputRef} type="file" accept={ACCEPT} className="hidden" onChange={handleFileChange} />
              <Button variant="ghost" size="sm" isLoading={busy} onClick={() => inputRef.current?.click()}>
                {hasDocument ? 'Replace' : 'Upload'}
              </Button>
              {hasDocument && (
                <Button variant="subtle" size="sm" isLoading={busy} onClick={() => withBusy(onRemove)}>
                  Remove
                </Button>
              )}
            </>
          )}
          {canVerify && hasDocument && (
            <Button
              variant={verified ? 'subtle' : 'primary'}
              size="sm"
              isLoading={busy}
              onClick={() => withBusy(verified ? onUnverify : onVerify)}
            >
              {verified ? 'Unmark verified' : 'Mark verified'}
            </Button>
          )}
        </div>
      </div>
    </GlassCard>
  )
}
