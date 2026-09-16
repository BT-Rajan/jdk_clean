import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
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
  RatingStars,
  Spinner,
  StatusBadge,
  Tabs,
  TabPanel,
} from '@/components/ui'
import type { TabItem } from '@/components/ui'
import { HistoryTimeline } from '@/components/history/HistoryTimeline'
import { StatusTransitionButtons } from '@/components/status/StatusTransitionButtons'
import { IdDocumentPanel } from '@/components/documents/IdDocumentPanel'
import {
  deleteSupplier,
  deleteSupplierIdDocument,
  fetchSupplierIdDocumentBlob,
  getSupplier,
  restoreSupplier,
  unverifySupplierId,
  updateSupplierOnboardingStatus,
  uploadSupplierIdDocument,
  verifySupplierId,
} from '@/api/suppliers'
import type { Supplier } from '@/types/supplier'
import { formatCurrency } from '@/lib/currency'
import { getApiErrorMessage } from '@/lib/apiError'
import { useAuth } from '@/hooks/useAuth'
import { canWrite } from '@/lib/roles'
import { SUPPLIER_ONBOARDING_STATUSES_REQUIRING_REASON, SUPPLIER_ONBOARDING_TRANSITIONS } from '@/lib/statusTransitions'
import { SuppliedMaterialsEditor } from './SuppliedMaterialsEditor'

const MODE_OF_SUPPLY_LABELS: Record<string, string> = {
  direct: 'Direct',
  distributor: 'Distributor',
  broker: 'Broker',
  import: 'Import',
}

const TABS: TabItem[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'onboarding', label: 'Onboarding' },
  { id: 'documents', label: 'Documents' },
  { id: 'materials', label: 'Materials supplied' },
  { id: 'history', label: 'History' },
]

export function SupplierDetailPage() {
  const { id } = useParams()
  const supplierId = Number(id)
  const navigate = useNavigate()
  const { user } = useAuth()

  const [supplier, setSupplier] = useState<Supplier | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [onboardingBusy, setOnboardingBusy] = useState(false)
  const [justDeleted, setJustDeleted] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState('overview')

  useEffect(() => {
    getSupplier(supplierId)
      .then(setSupplier)
      .catch((err) => setError(getApiErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [supplierId])

  async function handleDelete() {
    setBusy(true)
    try {
      await deleteSupplier(supplierId)
      setConfirmOpen(false)
      setJustDeleted(true)
      setNotice('Supplier deleted.')
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleOnboardingStatusChange(status: (typeof SUPPLIER_ONBOARDING_TRANSITIONS)['pending'][number], reason?: string) {
    setOnboardingBusy(true)
    setError(null)
    try {
      const updated = await updateSupplierOnboardingStatus(supplierId, status, reason)
      setSupplier(updated)
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
      const restored = await restoreSupplier(supplierId)
      setSupplier(restored)
      setJustDeleted(false)
      setNotice('Supplier restored.')
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setBusy(false)
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

  if (!supplier) {
    return (
      <AppLayout>
        <Alert variant="error">{error ?? 'Supplier not found.'}</Alert>
      </AppLayout>
    )
  }

  const canEdit = canWrite(user?.role) && !justDeleted
  const nextOnboardingStatuses = SUPPLIER_ONBOARDING_TRANSITIONS[supplier.onboarding_status]
  const canChangeOnboarding = canEdit && nextOnboardingStatuses.length > 0

  return (
    <AppLayout>
      <PageHeader
        title={supplier.name}
        subtitle={supplier.code}
        actions={
          canEdit ? (
            <>
              <Button
                variant="primary"
                size="sm"
                className="!w-9 !px-0"
                onClick={() => navigate(`/suppliers/${supplierId}/edit`)}
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
          ) : undefined
        }
      />

      <Alert variant="error">{error}</Alert>
      {notice && (
        <div className="mb-4 flex items-center justify-between rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          <span>{notice}</span>
          {justDeleted && canWrite(user?.role) && (
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
          <StatusBadge status={supplier.status} />
          <StatusBadge status={supplier.onboarding_status} />
          {supplier.mode_of_supply && (
            <Badge tone="info">{MODE_OF_SUPPLY_LABELS[supplier.mode_of_supply]}</Badge>
          )}
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-6">
          <Field label="Contact person" value={supplier.contact_person} />
          <Field label="City / Country" value={[supplier.city, supplier.country].filter(Boolean).join(', ')} />
          <Field label="Payment terms" value={`${supplier.payment_terms_days} days`} />
          <Field label="Rating" value={<RatingStars rating={supplier.rating} />} />
          <Field
            label="PO approval threshold"
            value={
              supplier.po_approval_threshold_override != null
                ? `${formatCurrency(supplier.po_approval_threshold_override)} (override)`
                : 'Factory default'
            }
          />
          <Field
            label="Discount threshold"
            value={
              supplier.discount_approval_threshold_override != null
                ? `${supplier.discount_approval_threshold_override}% (override)`
                : 'Factory default'
            }
          />
        </dl>
      </GlassCard>

      <Tabs items={TABS} activeId={activeTab} onChange={setActiveTab} className="mb-6" />

      <TabPanel id="overview" activeId={activeTab}>
        <GlassCard className="p-8">
          <dl className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <Field label="Status" value={<StatusBadge status={supplier.status} />} />
            <Field label="Onboarding" value={<StatusBadge status={supplier.onboarding_status} />} />
            <Field label="Contact person" value={supplier.contact_person} />
            <Field label="Email" value={supplier.email} />
            <Field label="Phone" value={supplier.phone} />
            <Field label="City" value={supplier.city} />
            <Field label="Country" value={supplier.country} />
            <Field label="Payment terms" value={`${supplier.payment_terms_days} days`} />
            <Field
              label="Mode of supply"
              value={supplier.mode_of_supply ? MODE_OF_SUPPLY_LABELS[supplier.mode_of_supply] : null}
            />
            <Field label="Rating" value={<RatingStars rating={supplier.rating} />} />
            <Field
              label="PO approval threshold"
              value={
                supplier.po_approval_threshold_override != null
                  ? `${formatCurrency(supplier.po_approval_threshold_override)} (override)`
                  : 'Using factory default'
              }
            />
            <Field
              label="Discount approval threshold"
              value={
                supplier.discount_approval_threshold_override != null
                  ? `${supplier.discount_approval_threshold_override}% (override)`
                  : 'Using factory default'
              }
            />
          </dl>
        </GlassCard>
      </TabPanel>

      <TabPanel id="onboarding" activeId={activeTab}>
        <GlassCard className="p-8">
          <h2 className="mb-4 font-display text-base font-medium text-white">Onboarding</h2>
          {supplier.onboarding_reason && (
            <p className="mb-4 text-sm text-white/60">
              <span className="text-white/40">Reason on file: </span>
              {supplier.onboarding_reason}
            </p>
          )}
          {canChangeOnboarding ? (
            <StatusTransitionButtons
              nextStatuses={nextOnboardingStatuses}
              reasonRequiredFor={SUPPLIER_ONBOARDING_STATUSES_REQUIRING_REASON}
              reasonLabel="Reason"
              busy={onboardingBusy}
              onChange={handleOnboardingStatusChange}
            />
          ) : (
            !supplier.onboarding_reason && <p className="text-sm text-white/40">No onboarding actions available.</p>
          )}
        </GlassCard>
      </TabPanel>

      <TabPanel id="documents" activeId={activeTab}>
        <IdDocumentPanel
          hasDocument={Boolean(supplier.id_document_filename)}
          verified={supplier.id_verified}
          verifiedAt={supplier.id_verified_at}
          canEdit={canEdit}
          canVerify={canEdit}
          onUpload={async (file) => setSupplier(await uploadSupplierIdDocument(supplierId, file))}
          onRemove={async () => setSupplier(await deleteSupplierIdDocument(supplierId))}
          onView={async () => {
            const blob = await fetchSupplierIdDocumentBlob(supplierId)
            window.open(URL.createObjectURL(blob), '_blank')
          }}
          onVerify={async () => setSupplier(await verifySupplierId(supplierId))}
          onUnverify={async () => setSupplier(await unverifySupplierId(supplierId))}
        />
      </TabPanel>

      <TabPanel id="materials" activeId={activeTab} keepMounted>
        <SuppliedMaterialsEditor supplierId={supplierId} canEdit={canWrite(user?.role)} />
      </TabPanel>

      <TabPanel id="history" activeId={activeTab}>
        <HistoryTimeline resourcePath="/api/suppliers" id={supplierId} />
      </TabPanel>

      <div className="mt-6">
        <Link to="/suppliers" className="text-sm text-white/50 hover:text-white">← Back to suppliers</Link>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Delete supplier"
        message={`Delete ${supplier.name}? This can be undone immediately after, but not once you leave this page.`}
        confirmLabel="Delete"
        danger
        busy={busy}
        onConfirm={handleDelete}
        onCancel={() => setConfirmOpen(false)}
      />
    </AppLayout>
  )
}
