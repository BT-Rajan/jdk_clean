import { useCallback, useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate, useParams } from 'react-router-dom'
import { z } from 'zod'
import { AppLayout } from '@/components/layout/AppLayout'
import { PageContainer } from '@/components/layout/PageContainer'
import { Alert, Button, GlassCard, SelectField, Spinner, TextField } from '@/components/ui'
import { getProduct, updateProduct } from '@/api/products'
import { listMachines } from '@/api/machines'
import { useSelectOptions } from '@/hooks/useSelectOptions'
import { useAuth } from '@/hooks/useAuth'
import { canWrite } from '@/lib/roles'
import { getApiErrorMessage } from '@/lib/apiError'
import type { Product } from '@/types/product'
import { BomEditor } from '@/pages/products/BomEditor'

const formulaSchema = z.object({
  machine_id: z.coerce.number().int().positive().optional().or(z.literal('').transform(() => undefined)),
  production_hours_per_unit: z.coerce.number().min(0, 'Must be 0 or more').optional().or(z.literal('').transform(() => undefined)),
  workers_required: z.coerce.number().int().min(0, 'Must be 0 or more').optional().or(z.literal('').transform(() => undefined)),
})
type FormulaFormValues = z.input<typeof formulaSchema>
type FormulaSubmitValues = z.output<typeof formulaSchema>

function useMachineOptions() {
  const fetcher = useCallback(() => listMachines({ page: 1, page_size: 200, status: 'active' }), [])
  return useSelectOptions(fetcher)
}

export function FactorySetupFormPage() {
  const { id } = useParams()
  const productId = Number(id)
  const navigate = useNavigate()
  const { user } = useAuth()
  const canEdit = canWrite(user?.role)

  const [product, setProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const { options: machines } = useMachineOptions()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormulaFormValues, unknown, FormulaSubmitValues>({ resolver: zodResolver(formulaSchema) })

  useEffect(() => {
    getProduct(productId)
      .then((p) => {
        setProduct(p)
        reset({
          machine_id: p.machine_id ?? undefined,
          production_hours_per_unit: p.production_hours_per_unit ?? undefined,
          workers_required: p.workers_required ?? undefined,
        })
      })
      .catch((err) => setLoadError(getApiErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [productId, reset])

  async function onSubmit(values: FormulaSubmitValues) {
    setFormError(null)
    setNotice(null)
    try {
      const updated = await updateProduct(productId, {
        machine_id: values.machine_id ?? null,
        production_hours_per_unit: values.production_hours_per_unit ?? null,
        workers_required: values.workers_required ?? null,
      })
      setProduct(updated)
      setNotice('Formula saved.')
    } catch (err) {
      setFormError(getApiErrorMessage(err))
    }
  }

  if (loading) {
    return (
      <AppLayout>
        <div className="flex justify-center py-24">
          <Spinner size={28} className="text-gold-300" />
        </div>
      </AppLayout>
    )
  }

  if (!product) {
    return (
      <AppLayout>
        <Alert variant="error">{loadError ?? 'Product not found.'}</Alert>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <PageContainer>
        <h1 className="font-display text-2xl font-medium text-white">
          {product.code} — {product.name}
        </h1>
        <p className="mt-2 text-sm text-white/50">
          This product's formula: to make 1 {product.unit}, how much of each raw material, how much machine time,
          and how many workers it takes. The feasibility check uses this — combined with current stock and
          production schedules — to decide if an order is achievable.
        </p>

        <GlassCard className="mt-8 p-8">
          <Alert variant="error">{formError}</Alert>
          {notice && (
            <div className="mb-4 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
              {notice}
            </div>
          )}
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
            <h2 className="font-display text-lg font-medium text-white">Machine, time &amp; labor</h2>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
              <SelectField label="Machine" error={errors.machine_id?.message} disabled={!canEdit} {...register('machine_id')}>
                <option value="">None</option>
                {machines.map((m) => (
                  <option key={m.id} value={m.id}>{m.code} — {m.name}</option>
                ))}
              </SelectField>
              <TextField
                label={`Hours per ${product.unit}`}
                type="number"
                step="0.01"
                disabled={!canEdit}
                error={errors.production_hours_per_unit?.message}
                {...register('production_hours_per_unit')}
              />
              <TextField
                label="Workers required (concurrent)"
                type="number"
                step="1"
                disabled={!canEdit}
                error={errors.workers_required?.message}
                {...register('workers_required')}
              />
            </div>
            <p className="text-xs text-white/40">
              Leave the machine or hours blank to skip the machine/time check for this product — only the raw
              material check will run. Workers required draws on the shared factory labor pool (Settings → Factory).
            </p>
            {canEdit && (
              <div className="mt-2 flex justify-end">
                <Button type="submit" isLoading={isSubmitting}>Save formula</Button>
              </div>
            )}
          </form>
        </GlassCard>

        <div className="mt-8">
          <BomEditor productId={productId} canEdit={canEdit} />
        </div>

        <div className="mt-6">
          <Button variant="ghost" onClick={() => navigate('/factory-setup')}>← Back to factory setup</Button>
        </div>
      </PageContainer>
    </AppLayout>
  )
}
