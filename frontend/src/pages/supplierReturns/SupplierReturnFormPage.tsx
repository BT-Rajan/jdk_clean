import { useCallback, useState } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { PageContainer } from '@/components/layout/PageContainer'
import { Alert, Button, GlassCard, SelectField, TextareaField, TextField } from '@/components/ui'
import { createSupplierReturn } from '@/api/supplierReturns'
import { listSuppliers } from '@/api/suppliers'
import { listRawMaterials } from '@/api/rawMaterials'
import { useSelectOptions } from '@/hooks/useSelectOptions'
import { getApiErrorMessage } from '@/lib/apiError'
import {
  supplierReturnSchema,
  todayDateInputMin,
  type SupplierReturnFormValues,
  type SupplierReturnSubmitValues,
} from '@/lib/validation'

function useSupplierOptions() {
  const fetcher = useCallback(() => listSuppliers({ page: 1, page_size: 200, status: 'active' }), [])
  return useSelectOptions(fetcher)
}

function useRawMaterialOptions() {
  const fetcher = useCallback(() => listRawMaterials({ page: 1, page_size: 200, status: 'active' }), [])
  return useSelectOptions(fetcher)
}

export function SupplierReturnFormPage() {
  const navigate = useNavigate()
  const [formError, setFormError] = useState<string | null>(null)
  const { options: suppliers } = useSupplierOptions()
  const { options: materials } = useRawMaterialOptions()

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SupplierReturnFormValues, unknown, SupplierReturnSubmitValues>({
    resolver: zodResolver(supplierReturnSchema),
    defaultValues: {
      supplier_id: 0,
      return_date: todayDateInputMin,
      reason: '',
      notes: '',
      lines: [{ raw_material_id: 0, quantity: 1 }],
    },
  })
  const { fields, append, remove } = useFieldArray({ control, name: 'lines' })

  async function onSubmit(values: SupplierReturnSubmitValues) {
    setFormError(null)
    try {
      const created = await createSupplierReturn(values)
      navigate(`/supplier-returns/${created.id}`)
    } catch (err) {
      setFormError(getApiErrorMessage(err))
    }
  }

  return (
    <AppLayout>
      <PageContainer>
        <h1 className="font-display text-2xl font-medium text-white">New supplier return</h1>
        <GlassCard className="mt-8 p-8">
          <Alert variant="error">{formError}</Alert>
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-6">
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <SelectField label="Supplier" error={errors.supplier_id?.message} {...register('supplier_id')}>
                <option value="">Choose…</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.code} — {s.name}</option>
                ))}
              </SelectField>
              <TextField
                label="Return date"
                type="date"
                max={todayDateInputMin}
                error={errors.return_date?.message}
                {...register('return_date')}
              />
            </div>

            <TextareaField
              label="Reason"
              placeholder="What was wrong with it -- off-spec, contaminated, damaged in transit…"
              error={errors.reason?.message}
              {...register('reason')}
            />

            <div>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-display text-lg font-medium text-white">Line items</h2>
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  onClick={() => append({ raw_material_id: 0, quantity: 1 })}
                >
                  Add line
                </Button>
              </div>
              {errors.lines?.message && <p className="mb-3 text-xs text-red-400">{errors.lines.message}</p>}
              <div className="flex flex-col gap-3">
                {fields.map((field, index) => (
                  <div
                    key={field.id}
                    className="grid grid-cols-1 gap-3 rounded-xl border border-white/10 p-4 sm:grid-cols-12 sm:items-end"
                  >
                    <div className="sm:col-span-7">
                      <SelectField label="Raw material" {...register(`lines.${index}.raw_material_id` as const)}>
                        <option value="">Choose…</option>
                        {materials.map((m) => (
                          <option key={m.id} value={m.id}>{m.code} — {m.name}</option>
                        ))}
                      </SelectField>
                    </div>
                    <div className="sm:col-span-3">
                      <TextField
                        label="Quantity"
                        type="number"
                        step="0.0001"
                        {...register(`lines.${index}.quantity` as const)}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <Button variant="ghost" size="sm" type="button" onClick={() => remove(index)}>Remove</Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <TextareaField label="Notes (optional)" {...register('notes')} />

            <div className="mt-2 flex justify-end gap-3">
              <Button variant="ghost" type="button" onClick={() => navigate(-1)}>Cancel</Button>
              <Button type="submit" isLoading={isSubmitting}>Record return</Button>
            </div>
          </form>
        </GlassCard>
      </PageContainer>
    </AppLayout>
  )
}
