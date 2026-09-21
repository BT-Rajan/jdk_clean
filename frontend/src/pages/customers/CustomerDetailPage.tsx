import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { useClientPagination } from '@/hooks/useClientPagination'
import {
  Alert,
  Badge,
  Button,
  ConfirmDialog,
  DeleteIcon,
  EditIcon,
  Field,
  GlassCard,
  PageHeader,
  Pagination,
  SelectField,
  Spinner,
  StatusBadge,
  Tabs,
  TabPanel,
} from '@/components/ui'
import type { TabItem } from '@/components/ui'
import { HistoryTimeline } from '@/components/history/HistoryTimeline'
import { StatusTransitionButtons } from '@/components/status/StatusTransitionButtons'
import { IdDocumentPanel } from '@/components/documents/IdDocumentPanel'
import { CustomerAvatarPanel } from '@/components/customers/CustomerAvatarPanel'
import {
  assignCustomer,
  deleteCustomer,
  deleteCustomerIdDocument,
  fetchCustomerIdDocumentBlob,
  getCustomer,
  getCustomerCredit,
  restoreCustomer,
  unverifyCustomerId,
  updateCustomerOnboardingStatus,
  uploadCustomerIdDocument,
  verifyCustomerId,
} from '@/api/customers'
import { listFeasibilities } from '@/api/feasibilities'
import { listQuotations } from '@/api/quotations'
import { listOrders } from '@/api/orders'
import { listDeliveryNotes } from '@/api/deliveryNotes'
import { listAssignableSalesmen } from '@/api/salesHome'
import type { AssignableSalesman } from '@/api/salesHome'
import type { Customer } from '@/types/customer'
import type { Feasibility } from '@/types/feasibility'
import type { Quotation } from '@/types/quotation'
import type { Order } from '@/types/order'
import type { DeliveryNote } from '@/types/deliveryNote'
import type { CustomerCreditStatus } from '@/types/payment'
import { getApiErrorMessage } from '@/lib/apiError'
import { formatCurrency } from '@/lib/currency'
import { formatDate } from '@/lib/dateFormat'
import { useAuth } from '@/hooks/useAuth'
import { canWrite, canWritePage, isAdmin } from '@/lib/roles'
import { CUSTOMER_ONBOARDING_STATUSES_REQUIRING_REASON, CUSTOMER_ONBOARDING_TRANSITIONS } from '@/lib/statusTransitions'

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: 'Cash',
  credit_card: 'Credit card',
  bank_transfer: 'Bank transfer',
  cheque: 'Cheque',
  other: 'Other',
}

const FOLLOW_UP_STAGE_LABELS: Record<string, string> = {
  none: 'None',
  '15_days': '15 days',
  '30_days': '30 days',
  '45_days': '45 days',
  legal: 'Legal',
}

const FOLLOW_UP_STATUS_LABELS: Record<string, string> = {
  up_to_date: 'Up to date',
  in_progress: 'In progress',
  overdue: 'Overdue',
  escalated: 'Escalated',
}

function buildTabs(): TabItem[] {
  return [
    { id: 'overview', label: 'Overview' },
    { id: 'commercial', label: 'Commercial' },
    { id: 'accounting', label: 'Accounting' },
    { id: 'followups', label: 'Follow-ups' },
    { id: 'onboarding', label: 'Onboarding' },
    { id: 'documents', label: 'Documents' },
    { id: 'history', label: 'History' },
  ]
}

function ActivitySection<T>({
  title,
  items,
  count,
  renderRow,
}: {
  title: string
  items: T[]
  count: number
  renderRow: (item: T) => { key: number | string; content: ReactNode }
}) {
  const pager = useClientPagination(items)
  if (count === 0) return null
  return (
    <GlassCard className="p-6">
      <h2 className="mb-4 font-display text-base font-medium text-white">
        {title} <span className="text-sm text-white/40">({count})</span>
      </h2>
      <div className="space-y-2">
        {pager.pageItems.map((item) => {
          const { key, content } = renderRow(item)
          return <div key={key}>{content}</div>
        })}
      </div>
      <Pagination className="mt-4" {...pager.pagerProps} />
    </GlassCard>
  )
}

export function CustomerDetailPage() {
  const { id } = useParams()
  const customerId = Number(id)
  const navigate = useNavigate()
  const { user, permissions } = useAuth()

  const [customer, setCustomer] = useState<Customer | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [onboardingBusy, setOnboardingBusy] = useState(false)
  const [justDeleted, setJustDeleted] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState('overview')

  const [feasibilityChecks, setFeasibilityChecks] = useState<Feasibility[]>([])
  const [quotations, setQuotations] = useState<Quotation[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [deliveryNotes, setDeliveryNotes] = useState<DeliveryNote[]>([])
  const [creditStatus, setCreditStatus] = useState<CustomerCreditStatus | null>(null)
  const [assignBusy, setAssignBusy] = useState(false)

  // The reassign dropdown comes from the Sales lookup (Sales Manager/admin
  // can call it) -- NOT from /api/users, which is admin-only and left the
  // manager with an empty list.
  const canAssign = isAdmin(user?.role) || user?.role === 'department_head'
  const [salesmen, setSalesmen] = useState<AssignableSalesman[]>([])
  useEffect(() => {
    if (!canAssign) return
    listAssignableSalesmen().then(setSalesmen).catch(() => setSalesmen([]))
  }, [canAssign])

  useEffect(() => {
    getCustomer(customerId)
      .then(setCustomer)
      .catch((err) => setError(getApiErrorMessage(err)))
      .finally(() => setLoading(false))
    getCustomerCredit(customerId)
      .then(setCreditStatus)
      .catch(() => setCreditStatus(null))
  }, [customerId])

  useEffect(() => {
    listFeasibilities({ page: 1, page_size: 10, customer_id: customerId })
      .then((res) => setFeasibilityChecks(res.items))
      .catch(() => setFeasibilityChecks([]))
    listQuotations({ page: 1, page_size: 10, customer_id: customerId })
      .then((res) => setQuotations(res.items))
      .catch(() => setQuotations([]))
    listOrders({ page: 1, page_size: 10, customer_id: customerId })
      .then((res) => {
        setOrders(res.items)
        // Delivery Note has no customer_id of its own to filter list by
        // (see types/deliveryNote.ts) -- it's reached the same way the
        // order detail page reaches it, via order_id, for each of this
        // customer's own orders.
        return Promise.all(
          res.items.map((o) =>
            listDeliveryNotes({ order_id: o.id, page: 1, page_size: 10 }).then((r) => r.items).catch(() => []),
          ),
        )
      })
      .then((groups) => groups && setDeliveryNotes(groups.flat()))
      .catch(() => setOrders([]))
  }, [customerId])

  async function handleDelete() {
    setBusy(true)
    try {
      await deleteCustomer(customerId)
      setConfirmOpen(false)
      setJustDeleted(true)
      setNotice('Customer deleted.')
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleOnboardingStatusChange(status: (typeof CUSTOMER_ONBOARDING_TRANSITIONS)['pending'][number], reason?: string) {
    setOnboardingBusy(true)
    setError(null)
    try {
      const updated = await updateCustomerOnboardingStatus(customerId, status, reason)
      setCustomer(updated)
      setNotice(`Onboarding status changed to ${status.replace(/_/g, ' ')}.`)
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setOnboardingBusy(false)
    }
  }

  async function handleRestore() {
    setBusy(true)
    try {
      const restored = await restoreCustomer(customerId)
      setCustomer(restored)
      setJustDeleted(false)
      setNotice('Customer restored.')
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleAssign(salespersonId: number | null) {
    setAssignBusy(true)
    setError(null)
    try {
      const updated = await assignCustomer(customerId, salespersonId)
      setCustomer(updated)
      setNotice(salespersonId ? 'Salesperson assigned.' : 'Salesperson unassigned.')
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setAssignBusy(false)
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

  if (!customer) {
    return (
      <AppLayout>
        <Alert variant="error">{error ?? 'Customer not found.'}</Alert>
      </AppLayout>
    )
  }

  const canEdit = canWrite(user?.role) && !justDeleted
  const nextOnboardingStatuses = CUSTOMER_ONBOARDING_TRANSITIONS[customer.onboarding_status]
  const canChangeOnboarding = canEdit && nextOnboardingStatuses.length > 0
  const activityCount = feasibilityChecks.length + quotations.length + orders.length + deliveryNotes.length

  return (
    <AppLayout>
      <PageHeader
        title={customer.name}
        subtitle={customer.code ? `${customer.customer_number} · ${customer.code}` : `${customer.customer_number} · Prospective`}
        actions={
          !justDeleted ? (
            <>
              {canWritePage(permissions, 'feasibilities') && (
                <Button size="sm" onClick={() => navigate(`/feasibilities/new?customer_id=${customerId}`)}>
                  New feasibility check
                </Button>
              )}
              {isAdmin(user?.role) && (
              <>
              <Button
                variant="primary"
                size="sm"
                className="!w-9 !px-0"
                onClick={() => navigate(`/customers/${customerId}/edit`)}
                aria-label="Edit"
              >
                <EditIcon />
              </Button>
              <Button
                variant="danger"
                size="sm"
                className="!w-9 !px-0"
                onClick={() => setConfirmOpen(true)}
                aria-label="Delete"
              >
                <DeleteIcon />
              </Button>
              </>
              )}
            </>
          ) : undefined
        }
      />

      <Alert variant="error">{error}</Alert>
      {notice && (
        <div className="mb-4 flex items-center justify-between rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          <span>{notice}</span>
          {justDeleted && isAdmin(user?.role) && (
            <button type="button" onClick={handleRestore} className="font-medium text-gold-300 underline">
              Undo
            </button>
          )}
        </div>
      )}

      {/* Compact summary strip -- same pattern as the Raw Material / Product
          detail pages: the "useful summaries" every section below drills into. */}
      <GlassCard className="mb-6 p-6">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={customer.status} />
          <StatusBadge status={customer.onboarding_status} />
          <Badge tone="info">{customer.customer_type === 'individual' ? 'Individual' : 'Business'}</Badge>
          {customer.category && <Badge tone="neutral">{customer.category}</Badge>}
          {(customer.tags ?? []).map((tag) => (
            <Badge key={tag} tone="neutral">
              {tag}
            </Badge>
          ))}
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-6">
          <Field label="Customer ID" value={customer.customer_number} />
          <Field label="Credit limit" value={formatCurrency(customer.credit_limit)} />
          <Field label="Payment terms" value={`${customer.payment_terms_days} days`} />
          <Field
            label="Outstanding balance"
            value={creditStatus?.limit_enforced ? formatCurrency(creditStatus.outstanding_balance) : '—'}
          />
          <Field
            label="Available credit"
            value={
              creditStatus?.limit_enforced ? (
                <span className={creditStatus.available_credit! < 0 ? 'text-red-300' : undefined}>
                  {formatCurrency(creditStatus.available_credit!)}
                </span>
              ) : (
                '—'
              )
            }
          />
          <Field label="City / Country" value={[customer.city, customer.country].filter(Boolean).join(', ')} />
        </dl>
      </GlassCard>

      <Tabs items={buildTabs()} activeId={activeTab} onChange={setActiveTab} className="mb-6" />

      <TabPanel id="overview" activeId={activeTab}>
        <GlassCard className="mb-6 p-8">
          <CustomerAvatarPanel
            customerId={customerId}
            name={customer.name}
            hasAvatar={Boolean(customer.avatar_filename)}
            canEdit={canEdit}
            onChange={(avatar_filename) => setCustomer((c) => (c ? { ...c, avatar_filename } : c))}
          />
        </GlassCard>

        <GlassCard className="mb-6 p-8">
          <h2 className="mb-4 font-display text-base font-medium text-white">Assigned salesman</h2>
          <div className="flex flex-wrap items-center gap-4">
            <Field label="Assigned to" value={customer.assigned_to ? (customer.assigned_to_name ?? `User #${customer.assigned_to}`) : 'Unassigned'} />
            {canAssign && (
              <SelectField
                label="Reassign"
                className="max-w-xs"
                disabled={assignBusy}
                value={customer.assigned_to ?? ''}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  handleAssign(e.target.value ? Number(e.target.value) : null)
                }
              >
                <option value="">-- Unassigned --</option>
                {salesmen.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name}
                  </option>
                ))}
              </SelectField>
            )}
          </div>
        </GlassCard>

        <GlassCard className="p-8">
          <dl className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <Field label="Customer ID" value={customer.customer_number} />
            <Field label="Status" value={<StatusBadge status={customer.status} />} />
            <Field label="Onboarding" value={<StatusBadge status={customer.onboarding_status} />} />
            <Field label="Type" value={customer.customer_type === 'individual' ? 'Individual' : 'Business'} />
            <Field
              label={customer.customer_type === 'individual' ? 'Civil ID' : 'Registration number'}
              value={customer.code}
            />
            <Field label="Legal / registered name" value={customer.name} />
            <Field label="Display / trading name" value={customer.trade_name} />
            <Field label="Category" value={customer.category} />
            <Field label="Website" value={customer.website} />
          </dl>

          <h2 className="mt-8 mb-4 border-t border-white/10 pt-6 font-display text-base font-medium text-white">
            Primary contact
          </h2>
          <dl className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <Field label="Contact person" value={customer.contact_person} />
            <Field label="Job position" value={customer.job_position} />
            <Field label="Email" value={customer.email} />
            <Field label="Phone" value={customer.phone} />
            <Field label="Alternate email" value={customer.alternate_email} />
            <Field label="Alternate phone" value={customer.alternate_phone} />
            <Field
              label="Company"
              value={
                customer.parent_company_id ? (
                  <Link to={`/customers/${customer.parent_company_id}`} className="text-gold-300 hover:underline">
                    {customer.parent_company_name ?? `Customer #${customer.parent_company_id}`}
                  </Link>
                ) : null
              }
            />
          </dl>

          <h2 className="mt-8 mb-4 border-t border-white/10 pt-6 font-display text-base font-medium text-white">
            Address
          </h2>
          <dl className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <Field label="Street line 1" value={customer.address_line1} />
            <Field label="Street line 2" value={customer.address_line2} />
            <Field label="City" value={customer.city} />
            <Field label="State / Province" value={customer.state} />
            <Field label="Country" value={customer.country} />
            <Field label="Billing / registered address" value={customer.billing_address} />
            <Field
              label="Delivery / site address"
              value={
                customer.shipping_address && customer.shipping_address === customer.billing_address
                  ? 'Same as billing address'
                  : customer.shipping_address
              }
            />
          </dl>
        </GlassCard>
        {/* The customer's work -- feasibility checks, quotations, orders and
            deliveries -- sits right under their details, not in a tab of its
            own (Sales spec section 5). Not a CRM timeline: just the records. */}
        {activityCount === 0 ? (
          <GlassCard className="p-8 text-center text-sm text-white/40">
            No feasibility checks, quotations, orders, or deliveries on file yet.
          </GlassCard>
        ) : (
          <div className="flex flex-col gap-6">
            <ActivitySection
              title="Feasibility checks"
              items={feasibilityChecks}
              count={feasibilityChecks.length}
              renderRow={(f) => ({
                key: f.id,
                content: (
                  <Link
                    to={`/feasibilities/${f.id}`}
                    className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-4 py-3 hover:border-white/20"
                  >
                    <span className="font-medium text-white">{f.feasibility_number}</span>
                    <span className="flex items-center gap-3">
                      <span className="text-sm text-white/40">{formatDate(f.created_at)}</span>
                      <StatusBadge status={f.status} />
                    </span>
                  </Link>
                ),
              })}
            />

            <ActivitySection
              title="Quotations"
              items={quotations}
              count={quotations.length}
              renderRow={(q) => ({
                key: q.id,
                content: (
                  <Link
                    to={`/quotations/${q.id}`}
                    className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-4 py-3 hover:border-white/20"
                  >
                    <span className="font-medium text-white">{q.quotation_number}</span>
                    <span className="flex items-center gap-3">
                      <span className="text-sm text-white/40">{formatCurrency(q.total_amount)}</span>
                      <StatusBadge status={q.status} />
                    </span>
                  </Link>
                ),
              })}
            />

            <ActivitySection
              title="Orders"
              items={orders}
              count={orders.length}
              renderRow={(o) => ({
                key: o.id,
                content: (
                  <Link
                    to={`/orders/${o.id}`}
                    className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-4 py-3 hover:border-white/20"
                  >
                    <span className="font-medium text-white">{o.order_number}</span>
                    <span className="flex items-center gap-3">
                      <span className="text-sm text-white/40">{formatCurrency(o.total_amount)}</span>
                      <StatusBadge status={o.status} />
                    </span>
                  </Link>
                ),
              })}
            />

            <ActivitySection
              title="Deliveries"
              items={deliveryNotes}
              count={deliveryNotes.length}
              renderRow={(n) => ({
                key: n.id,
                content: (
                  <Link
                    to={`/delivery-notes/${n.id}`}
                    className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-4 py-3 hover:border-white/20"
                  >
                    <span className="font-medium text-white">{n.delivery_note_number}</span>
                    <span className="flex items-center gap-3">
                      <span className="text-sm text-white/40">{formatDate(n.delivery_date)}</span>
                      <StatusBadge status={n.status} />
                    </span>
                  </Link>
                ),
              })}
            />
          </div>
        )}
      </TabPanel>

      <TabPanel id="commercial" activeId={activeTab}>
        <GlassCard className="p-8">
          <dl className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <Field label="Credit limit" value={formatCurrency(customer.credit_limit)} />
            <Field
              label="Payment terms"
              value={`${customer.payment_terms_type[0].toUpperCase()}${customer.payment_terms_type.slice(1)} (${customer.payment_terms_days} days)`}
            />
            <Field
              label="Discount approval threshold"
              value={
                customer.discount_approval_threshold_override != null
                  ? `${customer.discount_approval_threshold_override}% (override)`
                  : 'Using factory default'
              }
            />
            <Field label="Payment method" value={customer.payment_method ? PAYMENT_METHOD_LABELS[customer.payment_method] : null} />
            <Field label="Pricelist" value={customer.pricelist} />
          </dl>

          <h2 className="mt-8 mb-4 border-t border-white/10 pt-6 font-display text-base font-medium text-white">
            Purchase configuration
          </h2>
          <dl className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <Field label="Group RFQ" value={customer.group_rfq ? 'Yes' : 'No'} />
            <Field label="Buyer" value={customer.buyer_id ? (customer.buyer_name ?? `User #${customer.buyer_id}`) : null} />
            <Field
              label="Purchase payment terms"
              value={
                customer.purchase_payment_terms_type
                  ? `${customer.purchase_payment_terms_type[0].toUpperCase()}${customer.purchase_payment_terms_type.slice(1)}${
                      customer.purchase_payment_terms_days != null ? ` (${customer.purchase_payment_terms_days} days)` : ''
                    }`
                  : null
              }
            />
            <Field
              label="Purchase payment method"
              value={customer.purchase_payment_method ? PAYMENT_METHOD_LABELS[customer.purchase_payment_method] : null}
            />
            <Field label="Receipt reminder" value={customer.receipt_reminder ? 'Yes' : 'No'} />
            <Field label="Supplier currency" value={customer.supplier_currency} />
          </dl>

          <h2 className="mt-8 mb-4 border-t border-white/10 pt-6 font-display text-base font-medium text-white">
            Fiscal & reference
          </h2>
          <dl className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <Field label="Fiscal position" value={customer.fiscal_position} />
            <Field label="Reference" value={customer.reference} />
          </dl>

          {creditStatus && (
            <div className="mt-6 border-t border-white/10 pt-6">
              {creditStatus.limit_enforced ? (
                <>
                  {!creditStatus.id_verified && (
                    <p className="mb-4 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                      A credit limit is set, but this customer's id isn't verified yet -- confirming an order for
                      them will need admin approval until the id document below is uploaded and verified.
                    </p>
                  )}
                  <dl className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                    <Field label="Outstanding balance" value={formatCurrency(creditStatus.outstanding_balance)} />
                    <Field
                      label="Available credit"
                      value={
                        <span className={creditStatus.available_credit! < 0 ? 'text-red-300' : undefined}>
                          {formatCurrency(creditStatus.available_credit!)}
                        </span>
                      }
                    />
                  </dl>
                </>
              ) : (
                <p className="text-xs text-white/40">
                  No credit limit set -- orders for this customer aren't gated on outstanding balance. Set one above
                  to start enforcing it.
                </p>
              )}
            </div>
          )}

          <h2 className="mt-8 mb-4 border-t border-white/10 pt-6 font-display text-base font-medium text-white">
            Internal notes
          </h2>
          <p className="text-sm whitespace-pre-wrap text-white/80">{customer.notes || '—'}</p>
          <p className="mt-2 text-xs text-white/40">For internal staff use only -- never shown on customer-facing documents.</p>

          <h2 className="mt-8 mb-4 border-t border-white/10 pt-6 font-display text-base font-medium text-white">
            System information
          </h2>
          <dl className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <Field label="Created" value={formatDate(customer.created_at)} />
            <Field label="Last updated" value={formatDate(customer.updated_at)} />
          </dl>
        </GlassCard>
      </TabPanel>

      <TabPanel id="accounting" activeId={activeTab}>
        <GlassCard className="p-8">
          <p className="mb-6 text-xs text-white/40">
            This app has no general-ledger module -- these are stored reference values only, nothing posts against
            them automatically.
          </p>
          <dl className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            <Field label="Account receivable" value={customer.account_receivable} />
            <Field label="Account payable" value={customer.account_payable} />
            <Field label="Auto-post bills" value={customer.auto_post_bills === 'automatic' ? 'Automatic' : customer.auto_post_bills === 'manual' ? 'Manual' : null} />
          </dl>

          <h2 className="mt-8 mb-4 border-t border-white/10 pt-6 font-display text-base font-medium text-white">
            Bank accounts
          </h2>
          {customer.bank_accounts && customer.bank_accounts.length > 0 ? (
            <div className="space-y-3">
              {customer.bank_accounts.map((account, i) => (
                <div key={i} className="rounded-lg border border-white/10 bg-white/5 px-4 py-3">
                  <dl className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                    <Field label="Bank" value={account.bank_name} />
                    <Field label="Account number" value={account.account_number} />
                    <Field label="IBAN" value={account.iban} />
                    <Field label="SWIFT / BIC" value={account.swift_code} />
                  </dl>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-white/40">No bank accounts on file.</p>
          )}

          <h2 className="mt-8 mb-4 border-t border-white/10 pt-6 font-display text-base font-medium text-white">
            Journal items
          </h2>
          <p className="mb-3 text-sm text-white/40">
            No separate ledger/journal module exists here -- this customer's financial activity is its Orders and
            Payments below.
          </p>
          <button type="button" onClick={() => setActiveTab('activity')} className="text-sm text-gold-300 underline">
            View orders & payments activity →
          </button>
        </GlassCard>
      </TabPanel>

      <TabPanel id="followups" activeId={activeTab}>
        <GlassCard className="p-8">
          <p className="mb-6 text-xs text-white/40">
            No dunning/e-invoicing engine exists here -- these are manually-set status fields for staff to track
            collections by hand, not automation.
          </p>
          <dl className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <Field
              label="Follow-up stage"
              value={customer.follow_up_stage ? FOLLOW_UP_STAGE_LABELS[customer.follow_up_stage] : null}
            />
            <Field
              label="Follow-up status"
              value={customer.follow_up_status ? FOLLOW_UP_STATUS_LABELS[customer.follow_up_status] : null}
            />
            <Field
              label="Reminders"
              value={customer.reminder_mode ? (customer.reminder_mode === 'automatic' ? 'Automatic' : 'Manual') : null}
            />
            <Field label="Next reminder date" value={customer.next_reminder_date ? formatDate(customer.next_reminder_date) : null} />
            <Field
              label="Responsible"
              value={
                customer.followup_responsible_id
                  ? (customer.followup_responsible_name ?? `User #${customer.followup_responsible_id}`)
                  : null
              }
            />
          </dl>
        </GlassCard>
      </TabPanel>

      <TabPanel id="onboarding" activeId={activeTab}>
        <GlassCard className="p-8">
          <h2 className="mb-4 font-display text-base font-medium text-white">Onboarding</h2>
          {customer.onboarding_reason && (
            <p className="mb-4 text-sm text-white/60">
              <span className="text-white/40">Reason on file: </span>
              {customer.onboarding_reason}
            </p>
          )}
          {canChangeOnboarding ? (
            <StatusTransitionButtons
              nextStatuses={nextOnboardingStatuses}
              reasonRequiredFor={CUSTOMER_ONBOARDING_STATUSES_REQUIRING_REASON}
              reasonLabel="Reason"
              busy={onboardingBusy}
              onChange={handleOnboardingStatusChange}
            />
          ) : (
            !customer.onboarding_reason && <p className="text-sm text-white/40">No onboarding actions available.</p>
          )}
        </GlassCard>
      </TabPanel>

      <TabPanel id="documents" activeId={activeTab}>
        <IdDocumentPanel
          hasDocument={Boolean(customer.id_document_filename)}
          verified={customer.id_verified}
          verifiedAt={customer.id_verified_at}
          canEdit={canEdit}
          canVerify={canEdit}
          onUpload={async (file) => setCustomer(await uploadCustomerIdDocument(customerId, file))}
          onRemove={async () => setCustomer(await deleteCustomerIdDocument(customerId))}
          onView={async () => {
            const blob = await fetchCustomerIdDocumentBlob(customerId)
            window.open(URL.createObjectURL(blob), '_blank')
          }}
          onVerify={async () => setCustomer(await verifyCustomerId(customerId))}
          onUnverify={async () => setCustomer(await unverifyCustomerId(customerId))}
        />
      </TabPanel>

      <TabPanel id="history" activeId={activeTab}>
        <HistoryTimeline resourcePath="/api/customers" id={customerId} />
      </TabPanel>

      <div className="mt-6">
        <Link to="/customers" className="text-sm text-white/50 hover:text-white">
          ← Back to customers
        </Link>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Delete customer"
        message={`Delete ${customer.name}? This can be undone immediately after, but not once you leave this page.`}
        confirmLabel="Delete"
        danger
        busy={busy}
        onConfirm={handleDelete}
        onCancel={() => setConfirmOpen(false)}
      />
    </AppLayout>
  )
}
