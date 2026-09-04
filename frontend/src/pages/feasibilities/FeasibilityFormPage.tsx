import { useCallback, useState } from 'react'
import type { ReactNode } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { PageContainer } from '@/components/layout/PageContainer'
import { Alert, Button, GlassCard, SelectField, TextareaField, TextField } from '@/components/ui'
import { createFeasibility } from '@/api/feasibilities'
import { listCustomers } from '@/api/customers'
import { listProducts } from '@/api/products'
import { useSelectOptions } from '@/hooks/useSelectOptions'
import { useAsyncGuard } from '@/hooks/useAsyncGuard'
import { getApiErrorMessage } from '@/lib/apiError'
import { feasibilitySchema, todayDateInputMin, type FeasibilityFormValues, type FeasibilitySubmitValues } from '@/lib/validation'

function useCustomerOptions() {
  const fetcher = useCallback(() => listCustomers({ page: 1, page_size: 200, status: 'active' }), [])
  return useSelectOptions(fetcher)
}

function useProductOptions() {
  const fetcher = useCallback(() => listProducts({ page: 1, page_size: 200, status: 'active' }), [])
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

export function FeasibilityFormPage() {
  const navigate = useNavigate()
  const [formError, setFormError] = useState<string | null>(null)
  const { options: customers } = useCustomerOptions()
  const { options: products } = useProductOptions()
  const { busy: submitting, run: runGuarded } = useAsyncGuard()

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FeasibilityFormValues, unknown, FeasibilitySubmitValues>({
    resolver: zodResolver(feasibilitySchema),
    defaultValues: {
      customer_id: 0,
      required_by_date: '',
      notes: '',
      lines: [{ product_id: 0, quantity: 1 }],
    },
  })
  const { fields, append, remove } = useFieldArray({ control, name: 'lines' })

  async function onSubmit(values: FeasibilitySubmitValues) {
    setFormError(null)
    try {
      await runGuarded(async () => {
        const created = await createFeasibility({
          ...values,
          required_by_date: values.required_by_date || null,
          notes: values.notes || null,
        })
        navigate(`/feasibilities/${created.id}`)
      })
    } catch (err) {
      setFormError(getApiErrorMessage(err))
    }
  }

  return (
    <FormShell title="New feasibility check">
      <Alert variant="error">{formError}</Alert>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-6">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <SelectField label="Customer" error={errors.customer_id?.message} {...register('customer_id')}>
            <option value="">Choose…</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
            ))}
          </SelectField>
          <TextField
            label="Required by"
            type="date"
            min={todayDateInputMin}
            error={errors.required_by_date?.message}
            {...register('required_by_date')}
          />
        </div>
        <p className="-mt-3 text-xs text-white/40">
          The date the customer needs this by. Used to check whether there's enough production line time free before then,
          alongside the raw-material check.
        </p>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg font-medium text-white">What's needed</h2>
            <Button variant="ghost" size="sm" type="button" onClick={() => append({ product_id: 0, quantity: 1 })}>
              Add line
            </Button>
          </div>

          {errors.lines?.message && <p className="mb-3 text-xs text-red-400">{errors.lines.message}</p>}

          <div className="flex flex-col gap-3">
            {fields.map((field, index) => (
              <div key={field.id} className="grid grid-cols-1 gap-3 rounded-xl border border-white/10 p-4 sm:grid-cols-12 sm:items-end">
                <div className="sm:col-span-8">
                  <SelectField label="Product" {...register(`lines.${index}.product_id` as const)}>
                    <option value="">Choose…</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
                    ))}
                  </SelectField>
                </div>
                <div className="sm:col-span-3">
                  <TextField label="Quantity" type="number" step="0.0001" {...register(`lines.${index}.quantity` as const)} />
                </div>
                <div className="sm:col-span-1">
                  <Button variant="ghost" size="sm" type="button" onClick={() => remove(index)}>Remove</Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <TextareaField label="Notes" {...register('notes')} />

        <div className="mt-2 flex justify-end gap-3">
          <Button variant="ghost" type="button" onClick={() => navigate(-1)}>Cancel</Button>
          <Button type="submit" isLoading={submitting}>Create check</Button>
        </div>
      </form>
    </FormShell>
  )
}
