import { useRef, useState } from 'react'
import * as authApi from '@/api/auth'
import { Alert, Avatar, Button } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { getApiErrorMessage } from '@/lib/apiError'

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

export function AvatarEditor() {
  const { user, updateUser, avatarVersion, refreshAvatar } = useAuth()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [isRemoving, setIsRemoving] = useState(false)

  if (!user) return null

  function validate(file: File): string | null {
    if (!ALLOWED_TYPES.has(file.type)) {
      return 'Please choose a JPEG, PNG, or WEBP image.'
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return 'Image must be under 5 MB.'
    }
    return null
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
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
      const updated = await authApi.uploadAvatar(file)
      updateUser(updated)
      refreshAvatar()
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
      const updated = await authApi.deleteAvatar()
      updateUser(updated)
      refreshAvatar()
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setIsRemoving(false)
    }
  }

  return (
    <div>
      <Alert variant="error">{error}</Alert>

      <div className="flex items-center gap-6">
        <Avatar key={avatarVersion} avatarUrl={user.avatar_url} name={user.full_name} size="lg" />

        <div className="flex flex-col gap-2">
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
            Change photo
          </Button>
          {user.avatar_url && (
            <Button
              type="button"
              variant="subtle"
              size="sm"
              isLoading={isRemoving}
              onClick={handleRemove}
            >
              Remove photo
            </Button>
          )}
          <p className="text-xs text-white/40">JPEG, PNG, or WEBP. Up to 5 MB.</p>
        </div>
      </div>
    </div>
  )
}
