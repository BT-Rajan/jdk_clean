import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate, useParams } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { Alert, Button, GlassCard, SelectField, Spinner, TextField } from '@/components/ui'
import { createSupplier, getSupplier, updateSupplier } from '@/api/suppliers'
import { getApiErrorMessage } from '@/lib/apiError'
import {
  supplierEditSchema,
  supplierSchema,
  type SupplierEditFormValues,
  type SupplierEditSubmitValues,
  type SupplierFormValues,
  type SupplierSubmitValues,
} from '@/lib/validation'

export function SupplierFormPage() {
  const { id } = useParams()
  return id ? <SupplierEditForm id={Number(id)} /> : <SupplierCreateForm />
}

function FormShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <AppLayout>
      <div className="mx-auto max-w-2xl">
        <h1 className="font-display text-2xl font-medium text-white">{title}</h1>
        <GlassCard className="mt-8 p-8">{children}</GlassCard>
      </div>
    </AppLayout>
  )
}

function SupplierCreateForm() {
  const navigate = useNavigate()
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SupplierFormValues, unknown, SupplierSubmitValues>({
    resolver: zodResolver(supplierSchema),
    defaultValues: {
      code: '',
      name: '',
      contact_person: '',
      email: '',
      phone: '',
      address: '',
      city: '',
      country: '',
      tax_id: '',
      payment_terms_days: 30,
      status: 'active',
    },
  })

  async function onSubmit(values: SupplierSubmitValues) {
    setFormError(null)
    try {
      const created = await createSupplier(values)
      navigate(`/suppliers/${created.id}`)
    } catch (err) {
      setFormError(getApiErrorMessage(err))
    }
  }

  return (
    <FormShell title="New supplier">
      <Alert variant="error">{formError}</Alert>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <TextField label="Code" error={errors.code?.message} {...register('code')} />
          <TextField label="Name" error={errors.name?.message} {...register('name')} />
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <TextField label="Contact person" {...register('contact_person')} />
          <TextField label="Email" type="email" error={errors.email?.message} {...register('email')} />
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <TextField label="Phone" {...register('phone')} />
          <TextField label="Tax ID" {...register('tax_id')} />
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <TextField label="City" {...register('city')} />
          <TextField label="Country" {...register('country')} />
        </div>
        <TextField label="Address" {...register('address')} />
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
          </SelectField>
        </div>
        <div className="mt-2 flex justify-end gap-3">
          <Button variant="ghost" type="button" onClick={() => navigate(-1)}>Cancel</Button>
          <Button type="submit" isLoading={isSubmitting}>Create supplier</Button>
        </div>
      </form>
    </FormShell>
  )
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
          status: supplier.status,
        })
      })
      .catch((err) => setFormError(getApiErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [id, reset])

  async function onSubmit(values: SupplierEditSubmitValues) {
    setFormError(null)
    try {
      await updateSupplier(id, values)
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
          <p className="text-xs text-white/40">Address and tax ID can only be set when the supplier is created.</p>
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
