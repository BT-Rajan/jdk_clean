import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate, useParams } from 'react-router-dom'
import { Alert, Button, SelectField, Spinner, TextField } from '@/components/ui'
import { MasterFormShell as FormShell } from '@/components/master/MasterFormShell'
import { HistoryTimeline } from '@/components/history/HistoryTimeline'
import { createMachine, getMachine, updateMachine } from '@/api/machines'
import { getApiErrorMessage } from '@/lib/apiError'
import {
  machineEditSchema,
  machineSchema,
  type MachineEditFormValues,
  type MachineEditSubmitValues,
  type MachineFormValues,
  type MachineSubmitValues,
} from '@/lib/validation'

export function MachineFormPage() {
  const { id } = useParams()
  return id ? <MachineEditForm id={Number(id)} /> : <MachineCreateForm />
}

function MachineCreateForm() {
  const navigate = useNavigate()
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<MachineFormValues, unknown, MachineSubmitValues>({
    resolver: zodResolver(machineSchema),
    defaultValues: { code: '', name: '', capacity_hours_per_day: 8, status: 'active' },
  })

  async function onSubmit(values: MachineSubmitValues) {
    setFormError(null)
    try {
      await createMachine(values)
      navigate('/machines')
    } catch (err) {
      setFormError(getApiErrorMessage(err))
    }
  }

  return (
    <FormShell title="New machine">
      <Alert variant="error">{formError}</Alert>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <TextField label="Code" error={errors.code?.message} {...register('code')} />
          <TextField label="Name" error={errors.name?.message} {...register('name')} />
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <TextField
            label="Capacity (hours/day)"
            type="number"
            step="0.5"
            error={errors.capacity_hours_per_day?.message}
            {...register('capacity_hours_per_day')}
          />
          <SelectField label="Status" {...register('status')}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </SelectField>
        </div>
        <p className="text-xs text-white/40">
          Capacity is how many hours a day this machine can run — used by feasibility checks to work out whether it
          has enough free time to produce a requested quantity by the required date.
        </p>
        <div className="mt-2 flex justify-end gap-3">
          <Button variant="ghost" type="button" onClick={() => navigate(-1)}>Cancel</Button>
          <Button type="submit" isLoading={isSubmitting}>Create machine</Button>
        </div>
      </form>
    </FormShell>
  )
}

function MachineEditForm({ id }: { id: number }) {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<MachineEditFormValues, unknown, MachineEditSubmitValues>({
    resolver: zodResolver(machineEditSchema),
  })

  useEffect(() => {
    getMachine(id)
      .then((machine) => {
        reset({
          name: machine.name,
          capacity_hours_per_day: machine.capacity_hours_per_day,
          status: machine.status,
        })
      })
      .catch((err) => setFormError(getApiErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [id, reset])

  async function onSubmit(values: MachineEditSubmitValues) {
    setFormError(null)
    try {
      await updateMachine(id, values)
      navigate('/machines')
    } catch (err) {
      setFormError(getApiErrorMessage(err))
    }
  }

  return (
    <FormShell
      title="Edit machine"
      after={
        <div className="mt-6">
          <HistoryTimeline resourcePath="/api/machines" id={id} />
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
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <TextField
              label="Capacity (hours/day)"
              type="number"
              step="0.5"
              error={errors.capacity_hours_per_day?.message}
              {...register('capacity_hours_per_day')}
            />
            <SelectField label="Status" {...register('status')}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </SelectField>
          </div>
          <div className="mt-2 flex justify-end gap-3">
            <Button variant="ghost" type="button" onClick={() => navigate(-1)}>Cancel</Button>
            <Button type="submit" isLoading={isSubmitting}>Save changes</Button>
          </div>
        </form>
      )}
    </FormShell>
  )
}
