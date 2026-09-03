import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { PageContainer } from '@/components/layout/PageContainer'
import { Alert, Button, GlassCard, SelectField, Spinner, TextField } from '@/components/ui'
import { getCustomer, updateCustomer } from '@/api/customers'
import { getApiErrorMessage } from '@/lib/apiError'
import {
  customerEditSchema,
  type CustomerEditFormValues,
  type CustomerEditSubmitValues,
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

/** Editing an existing customer. Creating a new one goes through the
 * multi-step CustomerOnboardingWizardPage instead (see /customers/new
 * in App.tsx) -- this component only handles /customers/:id/edit now. */
export function CustomerFormPage() {
  const { id } = useParams()
  if (!id) return <Navigate to="/customers/new" replace />
  return <CustomerEditForm id={Number(id)} />
}

function CustomerEditForm({ id }: { id: number }) {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CustomerEditFormValues, unknown, CustomerEditSubmitValues>({
    resolver: zodResolver(customerEditSchema),
  })

  useEffect(() => {
    getCustomer(id)
      .then((customer) => {
        reset({
          name: customer.name,
          contact_person: customer.contact_person ?? '',
          email: customer.email ?? '',
          phone: customer.phone ?? '',
          city: customer.city ?? '',
          country: customer.country ?? '',
          credit_limit: customer.credit_limit,
          payment_terms_days: customer.payment_terms_days,
          status: customer.status,
        })
      })
      .catch((err) => setFormError(getApiErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [id, reset])

  async function onSubmit(values: CustomerEditSubmitValues) {
    setFormError(null)
    try {
      await updateCustomer(id, values)
      navigate(`/customers/${id}`)
    } catch (err) {
      setFormError(getApiErrorMessage(err))
    }
  }

  return (
    <FormShell title="Edit customer">
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
          <p className="text-xs text-white/40">
            Billing/shipping address and notes can only be set when the customer is created.
          </p>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <TextField
            label="Credit limit"
            type="number"
            step="0.01"
            hint="0 = not enforced. Above 0, confirming a new order that would push this customer's outstanding balance over the limit needs admin approval."
            error={errors.credit_limit?.message}
            {...register('credit_limit')}
          />
            <TextField label="Payment terms (days)" type="number" error={errors.payment_terms_days?.message} {...register('payment_terms_days')} />
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
