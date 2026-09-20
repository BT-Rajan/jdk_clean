import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { PageContainer } from '@/components/layout/PageContainer'
import {
  Alert,
  Button,
  Field,
  FormSectionHeading,
  GlassCard,
  RadioGroupField,
  SelectField,
  Spinner,
  TextareaField,
  TextField,
} from '@/components/ui'
import { getCustomer, updateCustomer } from '@/api/customers'
import { listCustomers } from '@/api/customers'
import { listUsers } from '@/api/users'
import { useSelectOptions } from '@/hooks/useSelectOptions'
import { getApiErrorMessage } from '@/lib/apiError'
import {
  customerEditSchema,
  formatTagsInput,
  parseTagsInput,
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
  // Locked after creation -- shown read-only, never submitted for edit.
  // See lib/validation/customer.ts customerEditSchema. code is the one
  // exception: null means this is still a prospective customer who
  // hasn't provided it yet, and can be filled in once (see
  // handleCompleteCode) -- but is locked the same way once set.
  const [locked, setLocked] = useState<{ name: string; code: string | null; idLabel: string } | null>(null)
  const [newCode, setNewCode] = useState('')
  const [savingCode, setSavingCode] = useState(false)
  // Convenience only -- not a stored field. When ticked, the shipping
  // address input is hidden and the billing address is copied over at
  // submit time, so the two don't have to be kept in sync by hand for
  // the common case where the delivery site is the registered address.
  const [shipSameAsBilling, setShipSameAsBilling] = useState(false)
  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CustomerEditFormValues, unknown, CustomerEditSubmitValues>({
    resolver: zodResolver(customerEditSchema),
  })
  const bankAccounts = useFieldArray({ control, name: 'bank_accounts' })

  const billingAddress = watch('billing_address')
  const paymentTermsType = watch('payment_terms_type')

  // Reference lists for the Company/Salesperson-shaped dropdowns below --
  // see hooks/useSelectOptions.ts. Companies excludes this record itself
  // (a customer can't be its own parent company).
  const { options: companyOptions } = useSelectOptions(() => listCustomers({ page: 1, page_size: 200 }))
  const parentCompanyOptions = companyOptions.filter((c) => c.id !== id)
  const { options: userOptions } = useSelectOptions(() => listUsers({ page: 1, page_size: 200, is_active: true }))

  useEffect(() => {
    getCustomer(id)
      .then((customer) => {
        setLocked({
          name: customer.name,
          code: customer.code,
          idLabel: customer.customer_type === 'individual' ? 'Civil ID' : 'Registration number',
        })
        setShipSameAsBilling(
          Boolean(customer.billing_address) && customer.billing_address === customer.shipping_address,
        )
        reset({
          customer_type: customer.customer_type,
          trade_name: customer.trade_name ?? '',
          contact_person: customer.contact_person ?? '',
          email: customer.email ?? '',
          phone: customer.phone ?? '',
          alternate_phone: customer.alternate_phone ?? '',
          alternate_email: customer.alternate_email ?? '',
          billing_address: customer.billing_address ?? '',
          shipping_address: customer.shipping_address ?? '',
          city: customer.city ?? '',
          country: customer.country ?? '',
          category: customer.category ?? '',
          credit_limit: customer.credit_limit,
          payment_terms_days: customer.payment_terms_days,
          payment_terms_type: customer.payment_terms_type,
          discount_approval_threshold_override: customer.discount_approval_threshold_override ?? '',
          status: customer.status,
          notes: customer.notes ?? '',
          parent_company_id: customer.parent_company_id ?? '',
          job_position: customer.job_position ?? '',
          website: customer.website ?? '',
          tags: formatTagsInput(customer.tags),
          address_line1: customer.address_line1 ?? '',
          address_line2: customer.address_line2 ?? '',
          state: customer.state ?? '',
          payment_method: customer.payment_method ?? '',
          pricelist: customer.pricelist ?? '',
          group_rfq: customer.group_rfq,
          buyer_id: customer.buyer_id ?? '',
          purchase_payment_terms_days: customer.purchase_payment_terms_days ?? '',
          purchase_payment_terms_type: customer.purchase_payment_terms_type ?? '',
          purchase_payment_method: customer.purchase_payment_method ?? '',
          receipt_reminder: customer.receipt_reminder,
          supplier_currency: customer.supplier_currency ?? '',
          fiscal_position: customer.fiscal_position ?? '',
          reference: customer.reference ?? '',
          bank_accounts: (customer.bank_accounts ?? []).map((b) => ({
            bank_name: b.bank_name,
            account_number: b.account_number,
            iban: b.iban ?? '',
            swift_code: b.swift_code ?? '',
          })),
          account_receivable: customer.account_receivable ?? '',
          account_payable: customer.account_payable ?? '',
          auto_post_bills: customer.auto_post_bills ?? '',
          follow_up_stage: customer.follow_up_stage ?? '',
          follow_up_status: customer.follow_up_status ?? '',
          reminder_mode: customer.reminder_mode ?? '',
          next_reminder_date: customer.next_reminder_date ?? '',
          followup_responsible_id: customer.followup_responsible_id ?? '',
        })
      })
      .catch((err) => setFormError(getApiErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [id, reset])

  // Keep shipping_address mirrored live while the checkbox is on, so the
  // value that's actually submitted is always current even though the
  // input itself is hidden (see the JSX below).
  useEffect(() => {
    if (shipSameAsBilling) setValue('shipping_address', billingAddress)
  }, [shipSameAsBilling, billingAddress, setValue])

  async function handleCompleteCode() {
    if (!newCode.trim()) return
    setSavingCode(true)
    setFormError(null)
    try {
      const updated = await updateCustomer(id, { code: newCode.trim() })
      setLocked((prev) => (prev ? { ...prev, code: updated.code } : prev))
    } catch (err) {
      setFormError(getApiErrorMessage(err))
    } finally {
      setSavingCode(false)
    }
  }

  async function onSubmit(values: CustomerEditSubmitValues) {
    setFormError(null)
    try {
      await updateCustomer(id, {
        ...values,
        discount_approval_threshold_override: values.discount_approval_threshold_override || null,
        // The zod ID/day-count fields above use the same coerce-to-number
        // pattern as discount_approval_threshold_override -- a blank
        // input parses as 0, which `|| null` folds back to "not set"
        // (0 is never a valid id, and "blank" is the only sensible
        // reading of a cleared purchase-terms-days input too).
        parent_company_id: values.parent_company_id || null,
        buyer_id: values.buyer_id || null,
        followup_responsible_id: values.followup_responsible_id || null,
        purchase_payment_terms_days: values.purchase_payment_terms_days || null,
        tags: parseTagsInput(values.tags) ?? null,
        payment_method: values.payment_method || null,
        purchase_payment_terms_type: values.purchase_payment_terms_type || null,
        purchase_payment_method: values.purchase_payment_method || null,
        auto_post_bills: values.auto_post_bills || null,
        follow_up_stage: values.follow_up_stage || null,
        follow_up_status: values.follow_up_status || null,
        reminder_mode: values.reminder_mode || null,
        next_reminder_date: values.next_reminder_date || null,
        bank_accounts: (values.bank_accounts ?? [])
          .filter((row) => row.bank_name.trim() && row.account_number.trim())
          .map((row) => ({
            bank_name: row.bank_name,
            account_number: row.account_number,
            iban: row.iban || null,
            swift_code: row.swift_code || null,
          })),
      })
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
          <FormSectionHeading>Basic information</FormSectionHeading>
          <div className="grid grid-cols-1 gap-6 rounded-xl border border-white/10 bg-white/5 p-5 sm:grid-cols-2">
            <Field label="Name" value={locked?.name} />
            {locked && locked.code === null ? (
              <div className="flex items-end gap-3">
                <TextField
                  label={locked.idLabel}
                  hint="Still prospective -- not provided yet"
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value)}
                />
                <Button type="button" size="sm" isLoading={savingCode} onClick={handleCompleteCode}>
                  Save
                </Button>
              </div>
            ) : (
              <Field label={locked?.idLabel ?? 'ID'} value={locked?.code} />
            )}
          </div>
          <p className="text-xs text-white/40">
            Name{locked?.code !== null && ` and ${locked?.idLabel?.toLowerCase()}`} {locked?.code !== null ? 'are' : 'is'} set at
            creation and can't be changed here.
          </p>
          <RadioGroupField
            label="Business or individual"
            error={errors.customer_type?.message}
            options={[
              { value: 'business', label: 'Business' },
              { value: 'individual', label: 'Individual' },
            ]}
            {...register('customer_type')}
          />
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <TextField
              label="Display / trading name"
              hint="Shown instead of the legal name above where set. Leave blank to just use the legal name."
              error={errors.trade_name?.message}
              {...register('trade_name')}
            />
            <TextField label="Category" error={errors.category?.message} {...register('category')} />
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <TextField label="Website" error={errors.website?.message} {...register('website')} />
            <TextField
              label="Tags"
              hint="Comma-separated, e.g. VIP, Wholesale"
              error={errors.tags?.message}
              {...register('tags')}
            />
          </div>

          <FormSectionHeading>Primary contact</FormSectionHeading>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <TextField label="Contact person" {...register('contact_person')} />
            <TextField label="Job position" error={errors.job_position?.message} {...register('job_position')} />
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <TextField label="Email" type="email" error={errors.email?.message} {...register('email')} />
            <TextField label="Phone" {...register('phone')} />
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <TextField label="Alternate phone" error={errors.alternate_phone?.message} {...register('alternate_phone')} />
            <TextField
              label="Alternate email"
              type="email"
              error={errors.alternate_email?.message}
              {...register('alternate_email')}
            />
          </div>
          <SelectField
            label="Company"
            hint="Links this contact to a parent company record."
            error={errors.parent_company_id?.message}
            {...register('parent_company_id')}
          >
            <option value="">-- None --</option>
            {parentCompanyOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </SelectField>

          <FormSectionHeading>Address</FormSectionHeading>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <TextField label="Street line 1" error={errors.address_line1?.message} {...register('address_line1')} />
            <TextField label="Street line 2" error={errors.address_line2?.message} {...register('address_line2')} />
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <TextField label="City" {...register('city')} />
            <TextField label="State / Province" error={errors.state?.message} {...register('state')} />
            <TextField label="Country" {...register('country')} />
          </div>
          <TextareaField label="Billing / registered address" {...register('billing_address')} />
          <label className="flex items-center gap-3 text-sm text-white/70">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-white/20 bg-transparent"
              checked={shipSameAsBilling}
              onChange={(e) => setShipSameAsBilling(e.target.checked)}
            />
            Delivery / site address same as billing address
          </label>
          {!shipSameAsBilling && (
            <TextareaField label="Delivery / site address" {...register('shipping_address')} />
          )}

          <FormSectionHeading>Commercial information</FormSectionHeading>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <TextField
              label="Credit limit"
              type="number"
              step="0.01"
              hint="0 = not enforced. Above 0, confirming a new order that would push this customer's outstanding balance over the limit needs admin approval."
              error={errors.credit_limit?.message}
              {...register('credit_limit')}
            />
            <SelectField label="Payment terms" {...register('payment_terms_type')}>
              <option value="cash">Cash</option>
              <option value="advance">Advance</option>
              <option value="credit">Credit</option>
              <option value="custom">Custom</option>
            </SelectField>
            <TextField
              label="Credit days"
              type="number"
              hint={paymentTermsType === 'credit' ? 'Required when payment terms is Credit.' : undefined}
              error={errors.payment_terms_days?.message}
              {...register('payment_terms_days')}
            />
          </div>
          <TextField
            label="Discount approval threshold override (%)"
            type="number"
            step="0.01"
            hint="Leave blank to use the factory-wide setting (Settings > Approvals). Set this to give this customer their own discount ceiling before a quotation/order needs admin sign-off."
            error={errors.discount_approval_threshold_override?.message}
            {...register('discount_approval_threshold_override')}
          />
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <SelectField label="Payment method" error={errors.payment_method?.message} {...register('payment_method')}>
              <option value="">-- None --</option>
              <option value="cash">Cash</option>
              <option value="credit_card">Credit card</option>
              <option value="bank_transfer">Bank transfer</option>
              <option value="cheque">Cheque</option>
              <option value="other">Other</option>
            </SelectField>
            <TextField
              label="Pricelist"
              hint="Reference label only -- no automatic repricing behind this."
              error={errors.pricelist?.message}
              {...register('pricelist')}
            />
          </div>

          <FormSectionHeading>Purchase configuration</FormSectionHeading>
          <p className="text-xs text-white/40">
            Purchasing from this contact (e.g. when it's also a source of consignment stock) -- separate from this
            customer's own Payment terms/method above.
          </p>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <SelectField label="Buyer" error={errors.buyer_id?.message} {...register('buyer_id')}>
              <option value="">-- None --</option>
              {userOptions.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name}
                </option>
              ))}
            </SelectField>
            <TextField
              label="Supplier currency"
              error={errors.supplier_currency?.message}
              {...register('supplier_currency')}
            />
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <SelectField
              label="Purchase payment terms"
              error={errors.purchase_payment_terms_type?.message}
              {...register('purchase_payment_terms_type')}
            >
              <option value="">-- None --</option>
              <option value="cash">Cash</option>
              <option value="advance">Advance</option>
              <option value="credit">Credit</option>
              <option value="custom">Custom</option>
            </SelectField>
            <TextField
              label="Purchase credit days"
              type="number"
              error={errors.purchase_payment_terms_days?.message}
              {...register('purchase_payment_terms_days')}
            />
            <SelectField
              label="Purchase payment method"
              error={errors.purchase_payment_method?.message}
              {...register('purchase_payment_method')}
            >
              <option value="">-- None --</option>
              <option value="cash">Cash</option>
              <option value="credit_card">Credit card</option>
              <option value="bank_transfer">Bank transfer</option>
              <option value="cheque">Cheque</option>
              <option value="other">Other</option>
            </SelectField>
          </div>
          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-3 text-sm text-white/70">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-white/20 bg-transparent"
                {...register('group_rfq')}
              />
              Group RFQ
            </label>
            <label className="flex items-center gap-3 text-sm text-white/70">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-white/20 bg-transparent"
                {...register('receipt_reminder')}
              />
              Receipt reminder
            </label>
          </div>

          <FormSectionHeading>Fiscal & reference</FormSectionHeading>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <TextField
              label="Fiscal position"
              hint="Reference label only -- no automatic tax mapping behind this."
              error={errors.fiscal_position?.message}
              {...register('fiscal_position')}
            />
            <TextField
              label="Reference"
              hint="Internal/external key or legacy code."
              error={errors.reference?.message}
              {...register('reference')}
            />
          </div>

          <FormSectionHeading>Accounting</FormSectionHeading>
          <p className="text-xs text-white/40">
            This app has no general-ledger module -- these are stored reference values only, nothing posts against
            them automatically.
          </p>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <TextField
              label="Account receivable"
              error={errors.account_receivable?.message}
              {...register('account_receivable')}
            />
            <TextField label="Account payable" error={errors.account_payable?.message} {...register('account_payable')} />
            <SelectField label="Auto-post bills" error={errors.auto_post_bills?.message} {...register('auto_post_bills')}>
              <option value="">-- None --</option>
              <option value="manual">Manual</option>
              <option value="automatic">Automatic</option>
            </SelectField>
          </div>
          <div className="flex flex-col gap-3">
            <span className="text-xs font-medium uppercase tracking-[0.14em] text-white/55">Bank accounts</span>
            {bankAccounts.fields.map((field, index) => (
              <div
                key={field.id}
                className="grid grid-cols-1 items-end gap-3 rounded-xl border border-white/10 bg-white/5 p-4 sm:grid-cols-[1fr_1fr_1fr_1fr_auto]"
              >
                <TextField label="Bank name" {...register(`bank_accounts.${index}.bank_name` as const)} />
                <TextField label="Account number" {...register(`bank_accounts.${index}.account_number` as const)} />
                <TextField label="IBAN" {...register(`bank_accounts.${index}.iban` as const)} />
                <TextField label="SWIFT / BIC" {...register(`bank_accounts.${index}.swift_code` as const)} />
                <Button type="button" variant="subtle" size="sm" onClick={() => bankAccounts.remove(index)}>
                  Remove
                </Button>
              </div>
            ))}
            {(errors.bank_accounts?.message ?? errors.bank_accounts?.root?.message) && (
              <p className="text-xs text-red-400">
                {errors.bank_accounts?.message ?? errors.bank_accounts?.root?.message}
              </p>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="self-start"
              onClick={() => bankAccounts.append({ bank_name: '', account_number: '', iban: '', swift_code: '' })}
            >
              Add bank account
            </Button>
          </div>

          <FormSectionHeading>Invoice follow-ups</FormSectionHeading>
          <p className="text-xs text-white/40">
            No dunning/e-invoicing engine exists here -- these are manually-set status fields for staff to track
            collections by hand.
          </p>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <SelectField
              label="Follow-up stage"
              error={errors.follow_up_stage?.message}
              {...register('follow_up_stage')}
            >
              <option value="">-- None --</option>
              <option value="none">None</option>
              <option value="15_days">15 days</option>
              <option value="30_days">30 days</option>
              <option value="45_days">45 days</option>
              <option value="legal">Legal</option>
            </SelectField>
            <SelectField
              label="Follow-up status"
              error={errors.follow_up_status?.message}
              {...register('follow_up_status')}
            >
              <option value="">-- None --</option>
              <option value="up_to_date">Up to date</option>
              <option value="in_progress">In progress</option>
              <option value="overdue">Overdue</option>
              <option value="escalated">Escalated</option>
            </SelectField>
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <RadioGroupField
              label="Reminders"
              error={errors.reminder_mode?.message}
              options={[
                { value: 'automatic', label: 'Automatic' },
                { value: 'manual', label: 'Manual' },
              ]}
              {...register('reminder_mode')}
            />
            <TextField
              label="Next reminder date"
              type="date"
              error={errors.next_reminder_date?.message}
              {...register('next_reminder_date')}
            />
            <SelectField
              label="Responsible"
              error={errors.followup_responsible_id?.message}
              {...register('followup_responsible_id')}
            >
              <option value="">-- None --</option>
              {userOptions.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name}
                </option>
              ))}
            </SelectField>
          </div>

          <FormSectionHeading>Status</FormSectionHeading>
          <SelectField label="Status" {...register('status')}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </SelectField>

          <FormSectionHeading>Internal notes</FormSectionHeading>
          <TextareaField
            label="Internal notes"
            hint="For internal staff use only -- never shown on quotations, orders, or customer-facing documents."
            {...register('notes')}
          />

          <div className="mt-2 flex justify-end gap-3">
            <Button variant="ghost" type="button" onClick={() => navigate(-1)}>Cancel</Button>
            <Button type="submit" isLoading={isSubmitting}>Save changes</Button>
          </div>
        </form>
      )}
    </FormShell>
  )
}
