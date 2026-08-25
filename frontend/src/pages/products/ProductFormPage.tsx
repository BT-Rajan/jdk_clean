import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate, useParams } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { PageContainer } from '@/components/layout/PageContainer'
import { Alert, Button, GlassCard, SelectField, Spinner, TextField, TextareaField } from '@/components/ui'
import { createProduct, getProduct, updateProduct } from '@/api/products'
import { listMachines } from '@/api/machines'
import { useSelectOptions } from '@/hooks/useSelectOptions'
import { getApiErrorMessage } from '@/lib/apiError'
import {
  productEditSchema,
  productSchema,
  propertiesToInput,
  tagsToInput,
  type ProductEditFormValues,
  type ProductEditSubmitValues,
  type ProductFormValues,
  type ProductSubmitValues,
} from '@/lib/validation'

export function ProductFormPage() {
  const { id } = useParams()
  return id ? <ProductEditForm id={Number(id)} /> : <ProductCreateForm />
}

function useMachineOptions() {
  const fetcher = useCallback(() => listMachines({ page: 1, page_size: 200, status: 'active' }), [])
  return useSelectOptions(fetcher)
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

function ProductCreateForm() {
  const navigate = useNavigate()
  const [formError, setFormError] = useState<string | null>(null)
  const { options: machines } = useMachineOptions()
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ProductFormValues, unknown, ProductSubmitValues>({
    resolver: zodResolver(productSchema),
    defaultValues: { code: '', name: '', unit: '', product_type: 'finished_good', selling_price: 0, batch_size: undefined, batch_production_hours: undefined, machine_id: undefined, production_hours_per_unit: undefined, workers_required: undefined, status: 'active', tags: '', properties: '' },
  })

  async function onSubmit(values: ProductSubmitValues) {
    setFormError(null)
    try {
      const created = await createProduct(values)
      navigate(`/products/${created.id}`)
    } catch (err) {
      setFormError(getApiErrorMessage(err))
    }
  }

  return (
    <FormShell title="New product">
      <Alert variant="error">{formError}</Alert>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <TextField label="Code" error={errors.code?.message} {...register('code')} />
          <TextField label="Name" error={errors.name?.message} {...register('name')} />
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <TextField label="Unit" placeholder="pcs, kg…" error={errors.unit?.message} {...register('unit')} />
          <SelectField label="Product type" {...register('product_type')}>
            <option value="finished_good">Finished good</option>
            <option value="sub_assembly">Sub-assembly</option>
          </SelectField>
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <TextField label="Selling price" type="number" step="0.01" error={errors.selling_price?.message} {...register('selling_price')} />
          <SelectField label="Status" {...register('status')}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </SelectField>
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <TextField
            label="Batch size (units)"
            type="number"
            step="0.01"
            error={errors.batch_size?.message}
            {...register('batch_size')}
          />
          <TextField
            label="Hours to produce one batch"
            type="number"
            step="0.01"
            error={errors.batch_production_hours?.message}
            {...register('batch_production_hours')}
          />
        </div>
        <p className="text-xs text-white/40">
          E.g. "500 units, 6 hours" -- the per-unit time the feasibility check actually uses is worked out from
          these two automatically. Leave both blank and set production hours per unit directly below instead if
          this product doesn't naturally come in batches.
        </p>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <SelectField label="Machine" error={errors.machine_id?.message} {...register('machine_id')}>
            <option value="">None</option>
            {machines.map((m) => (
              <option key={m.id} value={m.id}>{m.code} — {m.name}</option>
            ))}
          </SelectField>
          <TextField
            label="Production hours per unit"
            type="number"
            step="0.01"
            error={errors.production_hours_per_unit?.message}
            {...register('production_hours_per_unit')}
          />
        </div>
        <TextField
          label="Workers required (concurrent)"
          type="number"
          step="1"
          error={errors.workers_required?.message}
          {...register('workers_required')}
        />
        <p className="text-xs text-white/40">
          The machine and hours-per-unit are this product's "formula" for feasibility checks: they're used to work
          out whether there's enough machine time to produce a requested quantity by the required date. Leave blank
          to skip the machine-availability check for this product. Workers required draws on the shared factory
          labor pool (Settings → Factory setup).
        </p>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <TextField
            label="Tags"
            placeholder="seasonal, export-grade…"
            error={errors.tags?.message}
            {...register('tags')}
          />
          <TextareaField
            label="Properties"
            placeholder={'color: amber\nshelf_life_days: 180'}
            rows={3}
            error={errors.properties?.message}
            {...register('properties')}
          />
        </div>
        <p className="text-xs text-white/40">
          Tags and properties are descriptive only — not used by feasibility, BOM, or capacity calculations. Tags:
          comma-separated. Properties: one "key: value" pair per line.
        </p>
        <div className="mt-2 flex justify-end gap-3">
          <Button variant="ghost" type="button" onClick={() => navigate(-1)}>Cancel</Button>
          <Button type="submit" isLoading={isSubmitting}>Create product</Button>
        </div>
      </form>
    </FormShell>
  )
}

function ProductEditForm({ id }: { id: number }) {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [formError, setFormError] = useState<string | null>(null)
  const { options: machines } = useMachineOptions()
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ProductEditFormValues, unknown, ProductEditSubmitValues>({
    resolver: zodResolver(productEditSchema),
  })

  useEffect(() => {
    getProduct(id)
      .then((product) => {
        reset({
          name: product.name,
          unit: product.unit,
          product_type: product.product_type,
          selling_price: product.selling_price,
          batch_size: product.batch_size ?? undefined,
          batch_production_hours: product.batch_production_hours ?? undefined,
          machine_id: product.machine_id ?? undefined,
          production_hours_per_unit: product.production_hours_per_unit ?? undefined,
          workers_required: product.workers_required ?? undefined,
          status: product.status,
          tags: tagsToInput(product.tags),
          properties: propertiesToInput(product.properties),
        })
      })
      .catch((err) => setFormError(getApiErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [id, reset])

  async function onSubmit(values: ProductEditSubmitValues) {
    setFormError(null)
    try {
      await updateProduct(id, values)
      navigate(`/products/${id}`)
    } catch (err) {
      setFormError(getApiErrorMessage(err))
    }
  }

  return (
    <FormShell title="Edit product">
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
            <SelectField label="Product type" {...register('product_type')}>
              <option value="finished_good">Finished good</option>
              <option value="sub_assembly">Sub-assembly</option>
            </SelectField>
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <TextField label="Selling price" type="number" step="0.01" error={errors.selling_price?.message} {...register('selling_price')} />
            <SelectField label="Status" {...register('status')}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </SelectField>
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <TextField
              label="Batch size (units)"
              type="number"
              step="0.01"
              error={errors.batch_size?.message}
              {...register('batch_size')}
            />
            <TextField
              label="Hours to produce one batch"
              type="number"
              step="0.01"
              error={errors.batch_production_hours?.message}
              {...register('batch_production_hours')}
            />
          </div>
          <p className="text-xs text-white/40">
            E.g. "500 units, 6 hours" -- the per-unit time the feasibility check actually uses is worked out from
            these two automatically.
          </p>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <SelectField label="Machine" error={errors.machine_id?.message} {...register('machine_id')}>
              <option value="">None</option>
              {machines.map((m) => (
                <option key={m.id} value={m.id}>{m.code} — {m.name}</option>
              ))}
            </SelectField>
            <TextField
              label="Production hours per unit"
              type="number"
              step="0.01"
              error={errors.production_hours_per_unit?.message}
              {...register('production_hours_per_unit')}
            />
          </div>
          <TextField
            label="Workers required (concurrent)"
            type="number"
            step="1"
            error={errors.workers_required?.message}
            {...register('workers_required')}
          />
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <TextField
              label="Tags"
              placeholder="seasonal, export-grade…"
              error={errors.tags?.message}
              {...register('tags')}
            />
            <TextareaField
              label="Properties"
              placeholder={'color: amber\nshelf_life_days: 180'}
              rows={3}
              error={errors.properties?.message}
              {...register('properties')}
            />
          </div>
          <p className="text-xs text-white/40">
            Tags and properties are descriptive only — not used by feasibility, BOM, or capacity calculations. Tags:
            comma-separated. Properties: one "key: value" pair per line.
          </p>
          <div className="mt-2 flex justify-end gap-3">
            <Button variant="ghost" type="button" onClick={() => navigate(-1)}>Cancel</Button>
            <Button type="submit" isLoading={isSubmitting}>Save changes</Button>
          </div>
        </form>
      )}
    </FormShell>
  )
}
