import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as authApi from '@/api/auth'
import { Alert, Button, TextField } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { getApiErrorMessage } from '@/lib/apiError'
import { profileSchema } from '@/lib/validation'
import type { ProfileFormValues } from '@/lib/validation'

export function ContactDetailsForm() {
  const { user, updateUser } = useAuth()
  const [formError, setFormError] = useState<string | null>(null)
  const [succeeded, setSucceeded] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { full_name: user?.full_name ?? '', phone: user?.phone ?? '' },
  })

  if (!user) return null

  async function onSubmit(values: ProfileFormValues) {
    setFormError(null)
    setSucceeded(false)
    try {
      const updated = await authApi.updateProfile({
        full_name: values.full_name,
        phone: values.phone || null,
      })
      updateUser(updated)
      setSucceeded(true)
    } catch (error) {
      setFormError(getApiErrorMessage(error))
    }
  }

  return (
    <div>
      <Alert variant="error">{formError}</Alert>
      <Alert variant="success">{succeeded ? 'Contact details updated.' : null}</Alert>

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <TextField
            label="Full name"
            autoComplete="name"
            error={errors.full_name?.message}
            {...register('full_name')}
          />
          <TextField
            label="Phone"
            type="tel"
            autoComplete="tel"
            placeholder="Not set"
            error={errors.phone?.message}
            {...register('phone')}
          />
          <TextField label="Username" value={user.username} disabled readOnly />
          <TextField label="Email" value={user.email} disabled readOnly />
        </div>

        <Button type="submit" isLoading={isSubmitting} disabled={!isDirty} className="mt-6">
          Save changes
        </Button>
      </form>
    </div>
  )
}
