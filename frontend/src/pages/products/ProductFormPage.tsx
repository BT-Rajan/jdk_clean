import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate, useParams } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { PageContainer } from '@/components/layout/PageContainer'
import { Alert, Button, GlassCard, SelectField, Spinner, TextField } from '@/components/ui'
import { createProduct, getProduct, updateProduct } from '@/api/products'
import { getApiErrorMessage } from '@/lib/apiError'
import {
  productEditSchema,
  productSchema,
  type ProductEditFormValues,
  type ProductEditSubmitValues,
  type ProductFormValues,
  type ProductSubmitValues,
} from '@/lib/validation'

export function ProductFormPage() {
  const { id } = useParams()
  return id ? <ProductEditForm id={Number(id)} /> : <ProductCreateForm />
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
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ProductFormValues, unknown, ProductSubmitValues>({
    resolver: zodResolver(productSchema),
    defaultValues: { code: '', name: '', unit: '', product_type: 'finished_good', selling_price: 0, status: 'active' },
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
          status: product.status,
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
          <div className="mt-2 flex justify-end gap-3">
            <Button variant="ghost" type="button" onClick={() => navigate(-1)}>Cancel</Button>
            <Button type="submit" isLoading={isSubmitting}>Save changes</Button>
          </div>
        </form>
      )}
    </FormShell>
  )
}
