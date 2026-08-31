import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate, useParams } from 'react-router-dom'
import { Alert, Button, SelectField, Spinner, TextField } from '@/components/ui'
import { MasterFormShell } from '@/components/master/MasterFormShell'
import { HistoryTimeline } from '@/components/history/HistoryTimeline'
import { createDepartment, getDepartment, updateDepartment } from '@/api/departments'
import { getApiErrorMessage } from '@/lib/apiError'
import {
  departmentEditSchema,
  departmentSchema,
  type DepartmentEditFormValues,
  type DepartmentFormValues,
} from '@/lib/validation'

export function DepartmentFormPage() {
  const { id } = useParams()
  return id ? <DepartmentEditForm id={Number(id)} /> : <DepartmentCreateForm />
}

function DepartmentCreateForm() {
  const navigate = useNavigate()
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<DepartmentFormValues>({
    resolver: zodResolver(departmentSchema),
    defaultValues: { code: '', name: '', status: 'active' },
  })

  async function onSubmit(values: DepartmentFormValues) {
    setFormError(null)
    try {
      await createDepartment(values)
      navigate('/departments')
    } catch (err) {
      setFormError(getApiErrorMessage(err))
    }
  }

  return (
    <MasterFormShell title="New department">
      <Alert variant="error">{formError}</Alert>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <TextField label="Code" error={errors.code?.message} {...register('code')} />
          <TextField label="Name" error={errors.name?.message} {...register('name')} />
        </div>
        <SelectField label="Status" {...register('status')}>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </SelectField>
        <p className="text-xs text-white/40">
          Departments drive the Roles &amp; Permissions matrix and each user's department field -- see Master Data
          -&gt; People &amp; Organization.
        </p>
        <div className="mt-2 flex justify-end gap-3">
          <Button variant="ghost" type="button" onClick={() => navigate(-1)}>Cancel</Button>
          <Button type="submit" isLoading={isSubmitting}>Create department</Button>
        </div>
      </form>
    </MasterFormShell>
  )
}

function DepartmentEditForm({ id }: { id: number }) {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<DepartmentEditFormValues>({
    resolver: zodResolver(departmentEditSchema),
  })

  useEffect(() => {
    getDepartment(id)
      .then((department) => {
        reset({ name: department.name, status: department.status })
      })
      .catch((err) => setFormError(getApiErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [id, reset])

  async function onSubmit(values: DepartmentEditFormValues) {
    setFormError(null)
    try {
      await updateDepartment(id, values)
      navigate('/departments')
    } catch (err) {
      setFormError(getApiErrorMessage(err))
    }
  }

  return (
    <MasterFormShell
      title="Edit department"
      after={
        <div className="mt-6">
          <HistoryTimeline resourcePath="/api/departments" id={id} />
        </div>
      }
    >
      <Alert variant="error">{formError}</Alert>
      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner size={24} className="text-gold-300" />
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
          <TextField label="Name" error={errors.name?.message} {...register('name')} />
          <SelectField label="Status" {...register('status')}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </SelectField>
          <div className="mt-2 flex justify-end gap-3">
            <Button variant="ghost" type="button" onClick={() => navigate(-1)}>Cancel</Button>
            <Button type="submit" isLoading={isSubmitting}>Save changes</Button>
          </div>
        </form>
      )}
    </MasterFormShell>
  )
}
