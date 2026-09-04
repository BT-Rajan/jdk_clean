import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { Alert, Button, ConfirmDialog, Field, GlassCard, PageHeader, RatingStars, Spinner, StatusBadge } from '@/components/ui'
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

  return (
    <AppLayout>
      <PageHeader
        title={supplier.name}
        subtitle={supplier.code}
        actions={
          canWrite(user?.role) && !justDeleted ? (
            <>
              <Button variant="ghost" onClick={() => navigate(`/suppliers/${supplierId}/edit`)}>Edit</Button>
              <Button variant="danger" onClick={() => setConfirmOpen(true)}>Delete</Button>
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
        </dl>
      </GlassCard>

      {(() => {
        const nextOnboardingStatuses = SUPPLIER_ONBOARDING_TRANSITIONS[supplier.onboarding_status]
        const canChangeOnboarding = canWrite(user?.role) && !justDeleted && nextOnboardingStatuses.length > 0
        if (!supplier.onboarding_reason && !canChangeOnboarding) return null
        return (
          <GlassCard className="mt-6 p-8">
            <h2 className="mb-4 font-display text-base font-medium text-white">Onboarding</h2>
            {supplier.onboarding_reason && (
              <p className="mb-4 text-sm text-white/60">
                <span className="text-white/40">Reason on file: </span>
                {supplier.onboarding_reason}
              </p>
            )}
            {canChangeOnboarding && (
              <StatusTransitionButtons
                nextStatuses={nextOnboardingStatuses}
                reasonRequiredFor={SUPPLIER_ONBOARDING_STATUSES_REQUIRING_REASON}
                reasonLabel="Reason"
                busy={onboardingBusy}
                onChange={handleOnboardingStatusChange}
              />
            )}
          </GlassCard>
        )
      })()}

      <div className="mt-6">
        <IdDocumentPanel
          hasDocument={Boolean(supplier.id_document_filename)}
          verified={supplier.id_verified}
          verifiedAt={supplier.id_verified_at}
          canEdit={canWrite(user?.role) && !justDeleted}
          canVerify={canWrite(user?.role) && !justDeleted}
          onUpload={async (file) => setSupplier(await uploadSupplierIdDocument(supplierId, file))}
          onRemove={async () => setSupplier(await deleteSupplierIdDocument(supplierId))}
          onView={async () => {
            const blob = await fetchSupplierIdDocumentBlob(supplierId)
            window.open(URL.createObjectURL(blob), '_blank')
          }}
          onVerify={async () => setSupplier(await verifySupplierId(supplierId))}
          onUnverify={async () => setSupplier(await unverifySupplierId(supplierId))}
        />
      </div>

      <div className="mt-6">
        <SuppliedMaterialsEditor supplierId={supplierId} canEdit={canWrite(user?.role)} />
      </div>

      <div className="mt-6">
        <HistoryTimeline resourcePath="/api/suppliers" id={supplierId} />
      </div>

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
