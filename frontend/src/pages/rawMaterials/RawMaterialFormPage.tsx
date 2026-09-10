import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate, useParams } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { PageContainer } from '@/components/layout/PageContainer'
import { Alert, Button, GlassCard, SelectField, Spinner, TextField, TextareaField } from '@/components/ui'
import { createRawMaterial, getRawMaterial, updateRawMaterial } from '@/api/rawMaterials'
import { listSuppliers } from '@/api/suppliers'
import { useSelectOptions } from '@/hooks/useSelectOptions'
import { getApiErrorMessage } from '@/lib/apiError'
import {
  propertiesToInput,
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

function SectionHeading({ children }: { children: ReactNode }) {
  return <h2 className="mb-1 border-t border-white/10 pt-6 font-display text-sm font-medium text-white/70 first:mt-0 first:border-0 first:pt-0">{children}</h2>
}

const DEFAULT_VALUES = {
  code: '',
  name: '',
  unit: '',
  material_type: 'raw_material' as const,
  category: '',
  description: '',
  properties: '',
  manufacturer: '',
  manufacturer_part_number: '',
  reorder_point: 0,
  safety_stock: 0,
  maximum_stock: 0,
  storage_location: '',
  default_supplier_id: '' as const,
  unit_cost: 0,
  inspection_required: false,
  certificate_required: false,
  qc_notes: '',
  status: 'active' as const,
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
    defaultValues: DEFAULT_VALUES,
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
        <SectionHeading>Identity</SectionHeading>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <TextField label="Code" error={errors.code?.message} {...register('code')} />
          <TextField label="Name" error={errors.name?.message} {...register('name')} />
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          <TextField label="Unit" placeholder="pcs, kg…" error={errors.unit?.message} {...register('unit')} />
          <SelectField label="Material type" {...register('material_type')}>
            <option value="raw_material">Raw material</option>
            <option value="packaging">Packaging</option>
            <option value="consumable">Consumable</option>
          </SelectField>
          <TextField label="Category" error={errors.category?.message} {...register('category')} />
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <TextField label="Manufacturer / brand" error={errors.manufacturer?.message} {...register('manufacturer')} />
          <TextField
            label="Manufacturer part number"
            error={errors.manufacturer_part_number?.message}
            {...register('manufacturer_part_number')}
          />
        </div>
        <TextareaField label="Description" rows={3} error={errors.description?.message} {...register('description')} />
        <TextareaField
          label="Specification / properties"
          hint="One per line, as 'key: value' (e.g. grade: A)"
          rows={3}
          error={errors.properties?.message}
          {...register('properties')}
        />

        <SectionHeading>Stock control</SectionHeading>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          <TextField label="Reorder point" type="number" step="0.01" error={errors.reorder_point?.message} {...register('reorder_point')} />
          <TextField label="Safety stock" type="number" step="0.01" error={errors.safety_stock?.message} {...register('safety_stock')} />
          <TextField label="Maximum stock" type="number" step="0.01" error={errors.maximum_stock?.message} {...register('maximum_stock')} />
        </div>
        <TextField label="Storage location" error={errors.storage_location?.message} {...register('storage_location')} />

        <SectionHeading>Purchase information</SectionHeading>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <TextField label="Baseline unit cost" type="number" step="0.01" error={errors.unit_cost?.message} {...register('unit_cost')} />
          <SelectField label="Default supplier" {...register('default_supplier_id')}>
            <option value="">None</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </SelectField>
        </div>
        <p className="text-xs text-white/40">
          Supplier-specific pricing is set on the Procurement tab after creating this material.
        </p>

        <SectionHeading>Quality control</SectionHeading>
        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-3 text-sm text-white/70">
            <input type="checkbox" className="h-4 w-4 rounded border-white/20 bg-transparent" {...register('inspection_required')} />
            Inspection required
          </label>
          <label className="flex items-center gap-3 text-sm text-white/70">
            <input type="checkbox" className="h-4 w-4 rounded border-white/20 bg-transparent" {...register('certificate_required')} />
            Certificate required
          </label>
        </div>
        <TextareaField
          label="Acceptance specification / notes"
          rows={2}
          error={errors.qc_notes?.message}
          {...register('qc_notes')}
        />

        <SectionHeading>Status</SectionHeading>
        <SelectField label="Status" {...register('status')}>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="blocked">Blocked</option>
        </SelectField>

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
          material_type: material.material_type,
          category: material.category ?? '',
          description: material.description ?? '',
          properties: propertiesToInput(material.properties),
          manufacturer: material.manufacturer ?? '',
          manufacturer_part_number: material.manufacturer_part_number ?? '',
          reorder_point: material.reorder_point,
          safety_stock: material.safety_stock,
          maximum_stock: material.maximum_stock,
          storage_location: material.storage_location ?? '',
          default_supplier_id: material.default_supplier_id ?? '',
          unit_cost: material.unit_cost,
          inspection_required: material.inspection_required,
          certificate_required: material.certificate_required,
          qc_notes: material.qc_notes ?? '',
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
          <SectionHeading>Identity</SectionHeading>
          <TextField label="Name" error={errors.name?.message} {...register('name')} />
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <TextField label="Unit" placeholder="pcs, kg…" error={errors.unit?.message} {...register('unit')} />
            <SelectField label="Material type" {...register('material_type')}>
              <option value="raw_material">Raw material</option>
              <option value="packaging">Packaging</option>
              <option value="consumable">Consumable</option>
            </SelectField>
            <TextField label="Category" error={errors.category?.message} {...register('category')} />
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <TextField label="Manufacturer / brand" error={errors.manufacturer?.message} {...register('manufacturer')} />
            <TextField
              label="Manufacturer part number"
              error={errors.manufacturer_part_number?.message}
              {...register('manufacturer_part_number')}
            />
          </div>
          <TextareaField label="Description" rows={3} error={errors.description?.message} {...register('description')} />
          <TextareaField
            label="Specification / properties"
            hint="One per line, as 'key: value' (e.g. grade: A)"
            rows={3}
            error={errors.properties?.message}
            {...register('properties')}
          />

          <SectionHeading>Stock control</SectionHeading>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <TextField label="Reorder point" type="number" step="0.01" error={errors.reorder_point?.message} {...register('reorder_point')} />
            <TextField label="Safety stock" type="number" step="0.01" error={errors.safety_stock?.message} {...register('safety_stock')} />
            <TextField label="Maximum stock" type="number" step="0.01" error={errors.maximum_stock?.message} {...register('maximum_stock')} />
          </div>
          <TextField label="Storage location" error={errors.storage_location?.message} {...register('storage_location')} />

          <SectionHeading>Purchase information</SectionHeading>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <TextField label="Baseline unit cost" type="number" step="0.01" error={errors.unit_cost?.message} {...register('unit_cost')} />
            <SelectField label="Default supplier" {...register('default_supplier_id')}>
              <option value="">None</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </SelectField>
          </div>

          <SectionHeading>Quality control</SectionHeading>
          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-3 text-sm text-white/70">
              <input type="checkbox" className="h-4 w-4 rounded border-white/20 bg-transparent" {...register('inspection_required')} />
              Inspection required
            </label>
            <label className="flex items-center gap-3 text-sm text-white/70">
              <input type="checkbox" className="h-4 w-4 rounded border-white/20 bg-transparent" {...register('certificate_required')} />
              Certificate required
            </label>
          </div>
          <TextareaField
            label="Acceptance specification / notes"
            rows={2}
            error={errors.qc_notes?.message}
            {...register('qc_notes')}
          />

          <SectionHeading>Status</SectionHeading>
          <SelectField label="Status" {...register('status')}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="blocked">Blocked</option>
          </SelectField>

          <div className="mt-2 flex justify-end gap-3">
            <Button variant="ghost" type="button" onClick={() => navigate(-1)}>Cancel</Button>
            <Button type="submit" isLoading={isSubmitting}>Save changes</Button>
          </div>
        </form>
      )}
    </FormShell>
  )
}
