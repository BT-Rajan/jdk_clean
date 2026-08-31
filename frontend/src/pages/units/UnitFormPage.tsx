import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate, useParams } from 'react-router-dom'
import { Alert, Button, SelectField, Spinner, TextField } from '@/components/ui'
import { MasterFormShell } from '@/components/master/MasterFormShell'
import { HistoryTimeline } from '@/components/history/HistoryTimeline'
import { createUnit, getUnit, updateUnit } from '@/api/units'
import { getApiErrorMessage } from '@/lib/apiError'
import {
  unitOfMeasureEditSchema,
  unitOfMeasureSchema,
  type UnitOfMeasureEditFormValues,
  type UnitOfMeasureEditSubmitValues,
  type UnitOfMeasureFormValues,
  type UnitOfMeasureSubmitValues,
} from '@/lib/validation'

export function UnitFormPage() {
  const { id } = useParams()
  return id ? <UnitEditForm id={Number(id)} /> : <UnitCreateForm />
}

function UnitCreateForm() {
  const navigate = useNavigate()
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<UnitOfMeasureFormValues, unknown, UnitOfMeasureSubmitValues>({
    resolver: zodResolver(unitOfMeasureSchema),
    defaultValues: { code: '', name: '', category: 'weight', factor_to_base: 1, is_base: false, status: 'active' },
  })

  async function onSubmit(values: UnitOfMeasureSubmitValues) {
    setFormError(null)
    try {
      await createUnit(values)
      navigate('/units')
    } catch (err) {
      setFormError(getApiErrorMessage(err))
    }
  }

  return (
    <MasterFormShell title="New unit">
      <Alert variant="error">{formError}</Alert>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <TextField label="Code" placeholder="e.g. bag25" error={errors.code?.message} {...register('code')} />
          <TextField label="Name" placeholder="e.g. Bag (25kg)" error={errors.name?.message} {...register('name')} />
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <SelectField label="Category" error={errors.category?.message} {...register('category')}>
            <option value="weight">Weight</option>
            <option value="count">Count</option>
            <option value="volume">Volume</option>
          </SelectField>
          <TextField
            label="Factor to base"
            type="number"
            step="0.000001"
            error={errors.factor_to_base?.message}
            {...register('factor_to_base')}
          />
        </div>
        <label className="flex items-center gap-3 text-sm text-white/70">
          <input type="checkbox" className="h-4 w-4 rounded border-white/20 bg-transparent" {...register('is_base')} />
          Base unit for this category
        </label>
        <p className="text-xs text-white/40">
          Every raw material and BOM line's unit is picked from this list. Conversion between units in the same
          category (e.g. bag → kg) uses each unit's factor above -- exactly one unit per category can be marked base
          (factor 1).
        </p>
        <div className="mt-2 flex justify-end gap-3">
          <Button variant="ghost" type="button" onClick={() => navigate(-1)}>Cancel</Button>
          <Button type="submit" isLoading={isSubmitting}>Create unit</Button>
        </div>
      </form>
    </MasterFormShell>
  )
}

function UnitEditForm({ id }: { id: number }) {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [formError, setFormError] = useState<string | null>(null)
  const [category, setCategory] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<UnitOfMeasureEditFormValues, unknown, UnitOfMeasureEditSubmitValues>({
    resolver: zodResolver(unitOfMeasureEditSchema),
  })

  useEffect(() => {
    getUnit(id)
      .then((unit) => {
        setCategory(unit.category)
        reset({ name: unit.name, factor_to_base: unit.factor_to_base, is_base: unit.is_base, status: unit.status })
      })
      .catch((err) => setFormError(getApiErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [id, reset])

  async function onSubmit(values: UnitOfMeasureEditSubmitValues) {
    setFormError(null)
    try {
      await updateUnit(id, values)
      navigate('/units')
    } catch (err) {
      setFormError(getApiErrorMessage(err))
    }
  }

  return (
    <MasterFormShell
      title="Edit unit"
      after={
        <div className="mt-6">
          <HistoryTimeline resourcePath="/api/units" id={id} />
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
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <TextField label="Name" error={errors.name?.message} {...register('name')} />
            <TextField
              label="Factor to base"
              type="number"
              step="0.000001"
              error={errors.factor_to_base?.message}
              {...register('factor_to_base')}
            />
          </div>
          {category && <p className="text-xs text-white/40">Category: {category} (not editable -- create a new unit to change it)</p>}
          <div className="grid grid-cols-1 items-center gap-5 sm:grid-cols-2">
            <label className="flex items-center gap-3 text-sm text-white/70">
              <input type="checkbox" className="h-4 w-4 rounded border-white/20 bg-transparent" {...register('is_base')} />
              Base unit for this category
            </label>
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
    </MasterFormShell>
  )
}
