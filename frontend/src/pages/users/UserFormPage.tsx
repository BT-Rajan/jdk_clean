import { useEffect, useState } from 'react'
import type { ChangeEvent, ComponentProps, ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate, useParams } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { PageContainer } from '@/components/layout/PageContainer'
import { Alert, Button, GlassCard, PasswordField, SelectField, Spinner, TextField } from '@/components/ui'
import { createUser, deleteUserSignature, fetchUserSignatureBlob, getUser, updateUser, uploadUserSignature } from '@/api/users'
import { getApiErrorMessage } from '@/lib/apiError'
import { userCreateSchema, userEditSchema, type UserCreateFormValues, type UserEditFormValues } from '@/lib/validation'
import type { User } from '@/types/auth'

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

function DepartmentSelect(props: Omit<ComponentProps<typeof SelectField>, 'label' | 'children'>) {
  return (
    <SelectField
      label="Department"
      hint="Only affects staff -- admin/manager already have full access everywhere"
      {...props}
    >
      <option value="">None</option>
      <option value="sales">Sales (Quotations, Orders)</option>
      <option value="procurement">Procurement (Purchase Orders)</option>
      <option value="warehouse">Warehouse (Delivery Notes)</option>
    </SelectField>
  )
}

/** Admin-only signature upload/preview/remove -- assigned directly to the
 * user being edited, no self-upload, no approval step. Mirrors
 * AvatarEditor's blob-preview pattern. */
function SignatureManager({ user, onChange }: { user: User; onChange: (u: User) => void }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user.has_signature) {
      setPreviewUrl(null)
      return
    }
    let cancelled = false
    let objectUrl: string | null = null
    fetchUserSignatureBlob(user.id).then((blob) => {
      if (cancelled) return
      objectUrl = URL.createObjectURL(blob)
      setPreviewUrl(objectUrl)
    })
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [user.id, user.has_signature])

  async function handleUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const updated = await uploadUserSignature(user.id, file)
      onChange(updated)
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setBusy(false)
      e.target.value = ''
    }
  }

  async function handleRemove() {
    setBusy(true)
    setError(null)
    try {
      const updated = await deleteUserSignature(user.id)
      onChange(updated)
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl border border-white/10 p-4">
      <p className="text-xs font-medium tracking-wide text-white/55 uppercase">Signature</p>
      <p className="mt-1 text-xs text-white/40">Appears on documents this user creates once assigned.</p>
      <div className="mt-3 flex items-center gap-4">
        <div className="flex h-16 w-40 items-center justify-center rounded-lg border border-white/10 bg-white/95">
          {previewUrl ? (
            <img src={previewUrl} alt="Signature" className="max-h-14 max-w-36 object-contain" />
          ) : (
            <span className="text-xs text-ink-950/40">No signature</span>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <label className="cursor-pointer text-sm font-medium text-gold-300 hover:text-gold-200">
            {previewUrl ? 'Replace' : 'Upload'}
            <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleUpload} disabled={busy} />
          </label>
          {previewUrl && (
            <button type="button" onClick={handleRemove} disabled={busy} className="text-left text-sm text-white/50 hover:text-white">
              Remove
            </button>
          )}
        </div>
      </div>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
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
    defaultValues: { username: '', email: '', password: '', full_name: '', role: 'staff', department: '' },
  })

  async function onSubmit(values: UserCreateFormValues) {
    setFormError(null)
    try {
      const created = await createUser({ ...values, department: values.department || null })
      navigate(`/users/${created.id}`)
    } catch (err) {
      setFormError(getApiErrorMessage(err))
    }
  }

  return (
    <FormShell title="New user">
      <Alert variant="error">{formError}</Alert>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <TextField label="Username" error={errors.username?.message} {...register('username')} />
          <TextField label="Full name" error={errors.full_name?.message} {...register('full_name')} />
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <TextField label="Email" type="email" error={errors.email?.message} {...register('email')} />
          <RoleSelect {...register('role')} />
        </div>
        <DepartmentSelect {...register('department')} />
        <PasswordField label="Password" error={errors.password?.message} {...register('password')} />
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
  const [user, setUser] = useState<User | null>(null)
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
      .then((u) => {
        setUser(u)
        reset({ email: u.email, full_name: u.full_name, role: u.role, department: u.department ?? '', is_active: u.is_active })
      })
      .catch((err) => setFormError(getApiErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [id, reset])

  async function onSubmit(values: UserEditFormValues) {
    setFormError(null)
    try {
      await updateUser(id, { ...values, department: values.department || null })
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
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <TextField label="Full name" error={errors.full_name?.message} {...register('full_name')} />
            <TextField label="Email" type="email" error={errors.email?.message} {...register('email')} />
          </div>
          <div className="grid grid-cols-1 items-center gap-5 sm:grid-cols-2">
            <RoleSelect {...register('role')} />
            <label className="flex items-center gap-3 text-sm text-white/70">
              <input type="checkbox" className="h-4 w-4 rounded border-white/20 bg-transparent" {...register('is_active')} />
              Active
            </label>
          </div>
          <DepartmentSelect {...register('department')} />
          {user && <SignatureManager user={user} onChange={setUser} />}
          <div className="mt-2 flex justify-end gap-3">
            <Button variant="ghost" type="button" onClick={() => navigate(-1)}>Cancel</Button>
            <Button type="submit" isLoading={isSubmitting}>Save changes</Button>
          </div>
        </form>
      )}
    </FormShell>
  )
}
