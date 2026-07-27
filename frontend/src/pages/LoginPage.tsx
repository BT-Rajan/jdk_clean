import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useLocation, useNavigate } from 'react-router-dom'
import { AuthLayout } from '@/components/layout/AuthLayout'
import { Alert, Button, PasswordField, TextField } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { getApiErrorMessage } from '@/lib/apiError'
import { loginSchema } from '@/lib/validation'
import type { LoginFormValues } from '@/lib/validation'

interface LocationState {
  from?: { pathname: string }
}

export function LoginPage() {
  const { loginUser } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [formError, setFormError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: '', password: '' },
  })

  async function onSubmit(values: LoginFormValues) {
    setFormError(null)
    try {
      await loginUser(values)
      const state = location.state as LocationState | null
      const destination = state?.from?.pathname ?? '/dashboard'
      navigate(destination, { replace: true })
    } catch (error) {
      setFormError(getApiErrorMessage(error))
    }
  }

  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to continue to your workspace.">
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <Alert variant="error">{formError}</Alert>

        <div className="flex flex-col gap-5">
          <TextField
            label="Username"
            type="text"
            autoComplete="username"
            autoFocus
            error={errors.username?.message}
            {...register('username')}
          />

          <PasswordField
            label="Password"
            autoComplete="current-password"
            error={errors.password?.message}
            {...register('password')}
          />
        </div>

        <Button type="submit" isLoading={isSubmitting} className="mt-8 w-full">
          Sign in
        </Button>
      </form>
    </AuthLayout>
  )
}
