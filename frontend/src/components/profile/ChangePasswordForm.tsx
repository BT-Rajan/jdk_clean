import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from 'react-router-dom'
import { Alert, Button, PasswordField } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { getApiErrorMessage } from '@/lib/apiError'
import { changePasswordSchema } from '@/lib/validation'
import type { ChangePasswordFormValues } from '@/lib/validation'

const REDIRECT_DELAY_MS = 1600

export function ChangePasswordForm() {
  const { changeUserPassword } = useAuth()
  const navigate = useNavigate()
  const [formError, setFormError] = useState<string | null>(null)
  const [succeeded, setSucceeded] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordFormValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { current_password: '', new_password: '', confirm_password: '' },
  })

  async function onSubmit(values: ChangePasswordFormValues) {
    setFormError(null)
    try {
      await changeUserPassword({
        current_password: values.current_password,
        new_password: values.new_password,
      })
      setSucceeded(true)
      window.setTimeout(() => {
        navigate('/login', { replace: true })
      }, REDIRECT_DELAY_MS)
    } catch (error) {
      setFormError(getApiErrorMessage(error))
    }
  }

  return (
    <>
      <Alert variant="error">{formError}</Alert>
      <Alert variant="success">
        {succeeded ? 'Password changed. Redirecting to sign in…' : null}
      </Alert>

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className="flex flex-col gap-5">
          <PasswordField
            label="Current password"
            autoComplete="current-password"
            disabled={succeeded}
            error={errors.current_password?.message}
            {...register('current_password')}
          />
          <PasswordField
            label="New password"
            autoComplete="new-password"
            hint="At least 8 characters."
            disabled={succeeded}
            error={errors.new_password?.message}
            {...register('new_password')}
          />
          <PasswordField
            label="Confirm new password"
            autoComplete="new-password"
            disabled={succeeded}
            error={errors.confirm_password?.message}
            {...register('confirm_password')}
          />
        </div>

        <Button type="submit" isLoading={isSubmitting} disabled={succeeded} className="mt-8 w-full">
          Update password
        </Button>
      </form>
    </>
  )
}
