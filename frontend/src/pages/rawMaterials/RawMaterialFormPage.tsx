import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate, useParams } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { PageContainer } from '@/components/layout/PageContainer'
import { Alert, Button, GlassCard, SelectField, Spinner, TextField } from '@/components/ui'
import { createRawMaterial, getRawMaterial, updateRawMaterial } from '@/api/rawMaterials'
import { listSuppliers } from '@/api/suppliers'
import { useSelectOptions } from '@/hooks/useSelectOptions'
import { getApiErrorMessage } from '@/lib/apiError'
import {
  rawMaterialEditSchema,
  rawMaterialSchema,
  type RawMaterialEditFormValues,
  type RawMaterialEditSubmitValues,
  type RawMaterialFormValues,
  type RawMaterialSubmitValues,
} from '@/lib/validation'

export function RawMaterialFormPage() {
  const { id } = useParams()
  return id ? <RawMaterialEditForm id={Number(id)} /> : <RawMaterialCreateForm />
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

function useSupplierOptions() {
  const fetcher = useCallback(() => listSuppliers({ page: 1, page_size: 200, status: 'active' }), [])
  return useSelectOptions(fetcher)
}

function RawMaterialCreateForm() {
  const navigate = useNavigate()
  const [formError, setFormError] = useState<string | null>(null)
  const { options: suppliers } = useSupplierOptions()
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RawMaterialFormValues, unknown, RawMaterialSubmitValues>({
    resolver: zodResolver(rawMaterialSchema),
    defaultValues: { code: '', name: '', unit: '', reorder_point: 0, default_supplier_id: '', unit_cost: 0, status: 'active' },
  })

  async function onSubmit(values: RawMaterialSubmitValues) {
    setFormError(null)
    try {
      const created = await createRawMaterial({
        ...values,
        default_supplier_id: values.default_supplier_id || null,
      })
      navigate(`/raw-materials/${created.id}`)
    } catch (err) {
      setFormError(getApiErrorMessage(err))
    }
  }

  return (
    <FormShell title="New raw material">
      <Alert variant="error">{formError}</Alert>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <TextField label="Code" error={errors.code?.message} {...register('code')} />
          <TextField label="Name" error={errors.name?.message} {...register('name')} />
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <TextField label="Unit" placeholder="kg, m, pcs…" error={errors.unit?.message} {...register('unit')} />
          <SelectField label="Default supplier" {...register('default_supplier_id')}>
            <option value="">None</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </SelectField>
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          <TextField label="Reorder point" type="number" step="0.01" error={errors.reorder_point?.message} {...register('reorder_point')} />
          <TextField label="Unit cost" type="number" step="0.01" error={errors.unit_cost?.message} {...register('unit_cost')} />
          <SelectField label="Status" {...register('status')}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </SelectField>
        </div>
        <div className="mt-2 flex justify-end gap-3">
          <Button variant="ghost" type="button" onClick={() => navigate(-1)}>Cancel</Button>
          <Button type="submit" isLoading={isSubmitting}>Create material</Button>
        </div>
      </form>
    </FormShell>
  )
}

function RawMaterialEditForm({ id }: { id: number }) {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [formError, setFormError] = useState<string | null>(null)
  const { options: suppliers } = useSupplierOptions()
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<RawMaterialEditFormValues, unknown, RawMaterialEditSubmitValues>({
    resolver: zodResolver(rawMaterialEditSchema),
  })

  useEffect(() => {
    getRawMaterial(id)
      .then((material) => {
        reset({
          name: material.name,
          unit: material.unit,
          reorder_point: material.reorder_point,
          default_supplier_id: material.default_supplier_id ?? '',
          unit_cost: material.unit_cost,
          status: material.status,
        })
      })
      .catch((err) => setFormError(getApiErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [id, reset])

  async function onSubmit(values: RawMaterialEditSubmitValues) {
    setFormError(null)
    try {
      await updateRawMaterial(id, { ...values, default_supplier_id: values.default_supplier_id || null })
      navigate(`/raw-materials/${id}`)
    } catch (err) {
      setFormError(getApiErrorMessage(err))
    }
  }

  return (
    <FormShell title="Edit raw material">
      <Alert variant="error">{formError}</Alert>
      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner size={24} className="text-gold-300" />
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
          <TextField label="Name" error={errors.name?.message} {...register('name')} />
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <TextField label="Unit" error={errors.unit?.message} {...register('unit')} />
            <SelectField label="Default supplier" {...register('default_supplier_id')}>
              <option value="">None</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </SelectField>
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <TextField label="Reorder point" type="number" step="0.01" error={errors.reorder_point?.message} {...register('reorder_point')} />
            <TextField label="Unit cost" type="number" step="0.01" error={errors.unit_cost?.message} {...register('unit_cost')} />
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
