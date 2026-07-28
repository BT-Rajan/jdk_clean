import { useEffect, useState } from 'react'
import type { ComponentProps, ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate, useParams } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { PageContainer } from '@/components/layout/PageContainer'
import { Alert, Button, GlassCard, PasswordField, SelectField, Spinner, TextField } from '@/components/ui'
import { createUser, getUser, updateUser } from '@/api/users'
import { getApiErrorMessage } from '@/lib/apiError'
import { userCreateSchema, userEditSchema, type UserCreateFormValues, type UserEditFormValues } from '@/lib/validation'

export function UserFormPage() {
  const { id } = useParams()
  return id ? <UserEditForm id={Number(id)} /> : <UserCreateForm />
}

function FormShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <AppLayout>
      <PageContainer>
        <h1 className="font-display text-2xl font-medium text-white">{title}</h1>
        <GlassCard className="mt-8 p-8">{children}</GlassCard>
      </PageContainer>
    </AppLayout>
  )
}

function RoleSelect(props: Omit<ComponentProps<typeof SelectField>, 'label' | 'children'>) {
  return (
    <SelectField label="Role" {...props}>
      <option value="admin">Admin</option>
      <option value="manager">Manager</option>
      <option value="staff">Staff</option>
      <option value="viewer">Viewer</option>
    </SelectField>
  )
}

function UserCreateForm() {
  const navigate = useNavigate()
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<UserCreateFormValues>({
    resolver: zodResolver(userCreateSchema),
    defaultValues: { username: '', email: '', password: '', full_name: '', role: 'staff' },
  })

  async function onSubmit(values: UserCreateFormValues) {
    setFormError(null)
    try {
      const created = await createUser(values)
      navigate(`/users/${created.id}`)
    } catch (err) {
      setFormError(getApiErrorMessage(err))
    }
  }

  return (
    <FormShell title="New user">
      <Alert variant="error">{formError}</Alert>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
        <TextField label="Username" error={errors.username?.message} {...register('username')} />
        <TextField label="Full name" error={errors.full_name?.message} {...register('full_name')} />
        <TextField label="Email" type="email" error={errors.email?.message} {...register('email')} />
        <PasswordField label="Password" error={errors.password?.message} {...register('password')} />
        <RoleSelect {...register('role')} />
        <div className="mt-2 flex justify-end gap-3">
          <Button variant="ghost" type="button" onClick={() => navigate(-1)}>Cancel</Button>
          <Button type="submit" isLoading={isSubmitting}>Create user</Button>
        </div>
      </form>
    </FormShell>
  )
}

function UserEditForm({ id }: { id: number }) {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<UserEditFormValues>({
    resolver: zodResolver(userEditSchema),
  })

  useEffect(() => {
    getUser(id)
      .then((u) => reset({ email: u.email, full_name: u.full_name, role: u.role, is_active: u.is_active }))
      .catch((err) => setFormError(getApiErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [id, reset])

  async function onSubmit(values: UserEditFormValues) {
    setFormError(null)
    try {
      await updateUser(id, values)
      navigate(`/users/${id}`)
    } catch (err) {
      setFormError(getApiErrorMessage(err))
    }
  }

  return (
    <FormShell title="Edit user">
      <Alert variant="error">{formError}</Alert>
      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner size={24} className="text-gold-300" />
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
          <TextField label="Full name" error={errors.full_name?.message} {...register('full_name')} />
          <TextField label="Email" type="email" error={errors.email?.message} {...register('email')} />
          <RoleSelect {...register('role')} />
          <label className="flex items-center gap-3 text-sm text-white/70">
            <input type="checkbox" className="h-4 w-4 rounded border-white/20 bg-transparent" {...register('is_active')} />
            Active
          </label>
          <div className="mt-2 flex justify-end gap-3">
            <Button variant="ghost" type="button" onClick={() => navigate(-1)}>Cancel</Button>
            <Button type="submit" isLoading={isSubmitting}>Save changes</Button>
          </div>
        </form>
      )}
    </FormShell>
  )
}
