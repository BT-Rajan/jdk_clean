import { useEffect, useRef, useState } from 'react'
import { deleteCustomerAvatar, fetchCustomerAvatarBlob, uploadCustomerAvatar } from '@/api/customers'
import { Alert, Button } from '@/components/ui'
import { getApiErrorMessage } from '@/lib/apiError'

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return (parts[0]![0] + parts[parts.length - 1]![0]).toUpperCase()
}

interface CustomerAvatarPanelProps {
  customerId: number
  name: string
  hasAvatar: boolean
  canEdit: boolean
  onChange: (avatarFilename: string | null) => void
}

/** Logo/photo upload for a customer's detail page -- same shape as
 * components/profile/AvatarEditor.tsx (the user-avatar equivalent) but
 * fetched/served behind auth via the customer avatar endpoints, same as
 * IdDocumentPanel, rather than the public `avatar_url` a logged-in
 * user's own avatar uses. */
export function CustomerAvatarPanel({ customerId, name, hasAvatar, canEdit, onChange }: CustomerAvatarPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!hasAvatar) {
      setObjectUrl(null)
      return
    }
    let cancelled = false
    let currentUrl: string | null = null
    fetchCustomerAvatarBlob(customerId)
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
  }, [customerId, hasAvatar])

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!ALLOWED_TYPES.has(file.type)) {
      setError('Please choose a JPEG, PNG, or WEBP image.')
      return
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError('Image must be under 5 MB.')
      return
    }
    setError(null)
    setBusy(true)
    try {
      const updated = await uploadCustomerAvatar(customerId, file)
      onChange(updated.avatar_filename)
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleRemove() {
    setError(null)
    setBusy(true)
    try {
      const updated = await deleteCustomerAvatar(customerId)
      onChange(updated.avatar_filename)
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <Alert variant="error">{error}</Alert>
      <div className="flex items-center gap-6">
        {objectUrl ? (
          <img src={objectUrl} alt={`${name}'s logo`} className="h-20 w-20 rounded-full object-cover" />
        ) : (
          <div
            className="glass-inset flex h-20 w-20 shrink-0 items-center justify-center rounded-full font-display text-2xl font-medium text-gold-200"
            aria-label={`${name}'s logo`}
            role="img"
          >
            {getInitials(name)}
          </div>
        )}
        {canEdit && (
          <div className="flex flex-col gap-2">
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleFileChange}
            />
            <Button type="button" variant="ghost" size="sm" isLoading={busy} onClick={() => inputRef.current?.click()}>
              {hasAvatar ? 'Replace logo' : 'Upload logo'}
            </Button>
            {hasAvatar && (
              <Button type="button" variant="subtle" size="sm" isLoading={busy} onClick={handleRemove}>
                Remove
              </Button>
            )}
            <p className="text-xs text-white/40">JPEG, PNG, or WEBP. Up to 5 MB.</p>
          </div>
        )}
      </div>
    </div>
  )
}
