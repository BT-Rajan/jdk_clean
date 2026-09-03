import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { PageContainer } from '@/components/layout/PageContainer'
import { Alert, Button, GlassCard, SelectField, Spinner, TextField } from '@/components/ui'
import { getSupplier, updateSupplier } from '@/api/suppliers'
import { getApiErrorMessage } from '@/lib/apiError'
import {
  supplierEditSchema,
  type SupplierEditFormValues,
  type SupplierEditSubmitValues,
} from '@/lib/validation'

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

/** Editing an existing supplier. Creating a new one goes through the
 * multi-step SupplierOnboardingWizardPage instead (see /suppliers/new
 * in App.tsx) -- this component only handles /suppliers/:id/edit now. */
export function SupplierFormPage() {
  const { id } = useParams()
  if (!id) return <Navigate to="/suppliers/new" replace />
  return <SupplierEditForm id={Number(id)} />
}

function SupplierEditForm({ id }: { id: number }) {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<SupplierEditFormValues, unknown, SupplierEditSubmitValues>({
    resolver: zodResolver(supplierEditSchema),
  })

  useEffect(() => {
    getSupplier(id)
      .then((supplier) => {
        reset({
          name: supplier.name,
          contact_person: supplier.contact_person ?? '',
          email: supplier.email ?? '',
          phone: supplier.phone ?? '',
          city: supplier.city ?? '',
          country: supplier.country ?? '',
          payment_terms_days: supplier.payment_terms_days,
          mode_of_supply: supplier.mode_of_supply ?? '',
          rating: supplier.rating ?? '',
          status: supplier.status,
        })
      })
      .catch((err) => setFormError(getApiErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [id, reset])

  async function onSubmit(values: SupplierEditSubmitValues) {
    setFormError(null)
    try {
      await updateSupplier(id, {
        ...values,
        mode_of_supply: values.mode_of_supply || null,
        rating: values.rating || null,
      })
      navigate(`/suppliers/${id}`)
    } catch (err) {
      setFormError(getApiErrorMessage(err))
    }
  }

  return (
    <FormShell title="Edit supplier">
      <Alert variant="error">{formError}</Alert>
      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner size={24} className="text-gold-300" />
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
          <TextField label="Name" error={errors.name?.message} {...register('name')} />
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <TextField label="Contact person" {...register('contact_person')} />
            <TextField label="Email" type="email" error={errors.email?.message} {...register('email')} />
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <TextField label="Phone" {...register('phone')} />
            <TextField label="City" {...register('city')} />
          </div>
          <TextField label="Country" {...register('country')} />
          <p className="text-xs text-white/40">Address can only be set when the supplier is created.</p>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <TextField
              label="Payment terms (days)"
              type="number"
              error={errors.payment_terms_days?.message}
              {...register('payment_terms_days')}
            />
            <SelectField label="Status" {...register('status')}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="suspended">Suspended</option>
            </SelectField>
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <SelectField label="Mode of supply" {...register('mode_of_supply')}>
              <option value="">Not set</option>
              <option value="direct">Direct</option>
              <option value="distributor">Distributor</option>
              <option value="broker">Broker</option>
              <option value="import">Import</option>
            </SelectField>
            <SelectField label="Rating" error={errors.rating?.message} {...register('rating')}>
              <option value="">Not rated</option>
              <option value="1">★☆☆☆☆ (1)</option>
              <option value="2">★★☆☆☆ (2)</option>
              <option value="3">★★★☆☆ (3)</option>
              <option value="4">★★★★☆ (4)</option>
              <option value="5">★★★★★ (5)</option>
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
