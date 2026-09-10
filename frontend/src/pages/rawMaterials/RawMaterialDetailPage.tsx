import { useCallback, useEffect, useState } from 'react'
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
  Spinner,
  StatusBadge,
  Tabs,
  TabPanel,
} from '@/components/ui'
import type { TabItem } from '@/components/ui'
import { HistoryTimeline } from '@/components/history/HistoryTimeline'
import { WhereUsedPanel } from '@/components/master/WhereUsedPanel'
import { deleteRawMaterial, getRawMaterial, restoreRawMaterial } from '@/api/rawMaterials'
import { getStock } from '@/api/inventory'
import { getSupplier } from '@/api/suppliers'
import type { RawMaterial } from '@/types/rawMaterial'
import type { StockLevel } from '@/types/inventory'
import type { SupplierMaterial } from '@/types/supplierMaterial'
import { getApiErrorMessage } from '@/lib/apiError'
import { useAuth } from '@/hooks/useAuth'
import { canWrite } from '@/lib/roles'
import { formatCurrency } from '@/lib/currency'
import { MaterialSuppliersPanel } from './MaterialSuppliersPanel'
import { MaterialAlternativesPanel } from './MaterialAlternativesPanel'

const MATERIAL_TYPE_LABELS: Record<string, string> = {
  raw_material: 'Raw material',
  packaging: 'Packaging',
  consumable: 'Consumable',
}

const TABS: TabItem[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'stock', label: 'Stock control' },
  { id: 'procurement', label: 'Procurement' },
  { id: 'specification', label: 'Specification' },
  { id: 'alternatives', label: 'Alternatives' },
  { id: 'where-used', label: 'Where used' },
  { id: 'quality', label: 'Quality control' },
  { id: 'purchasing', label: 'Purchase info' },
  { id: 'history', label: 'History' },
]

function moneyIn(amount: number, currency: string): string {
  return `${currency} ${amount.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`
}

export function RawMaterialDetailPage() {
  const { id } = useParams()
  const materialId = Number(id)
  const navigate = useNavigate()
  const { user } = useAuth()

  const [material, setMaterial] = useState<RawMaterial | null>(null)
  const [defaultSupplierName, setDefaultSupplierName] = useState<string | null>(null)
  const [stock, setStock] = useState<StockLevel | null>(null)
  const [suppliers, setSuppliers] = useState<SupplierMaterial[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [justDeleted, setJustDeleted] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState('overview')

  useEffect(() => {
    getRawMaterial(materialId)
      .then((m) => {
        setMaterial(m)
        if (m.default_supplier_id) {
          getSupplier(m.default_supplier_id).then((s) => setDefaultSupplierName(s.name)).catch(() => {})
        }
      })
      .catch((err) => setError(getApiErrorMessage(err)))
      .finally(() => setLoading(false))
    getStock('raw_material', materialId)
      .then(setStock)
      .catch(() => {})
  }, [materialId])

  const handleSuppliersChange = useCallback((lines: SupplierMaterial[]) => setSuppliers(lines), [])

  async function handleDelete() {
    setBusy(true)
    try {
      await deleteRawMaterial(materialId)
      setConfirmOpen(false)
      setJustDeleted(true)
      setNotice('Raw material deleted.')
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleRestore() {
    setBusy(true)
    try {
      const restored = await restoreRawMaterial(materialId)
      setMaterial(restored)
      setJustDeleted(false)
      setNotice('Raw material restored.')
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

  if (!material) {
    return (
      <AppLayout>
        <Alert variant="error">{error ?? 'Raw material not found.'}</Alert>
      </AppLayout>
    )
  }

  const activeSuppliers = (suppliers ?? []).filter((s) => s.status === 'active')
  const preferred = activeSuppliers.find((s) => s.is_preferred) ?? null
  const lowestPrice = activeSuppliers.reduce<SupplierMaterial | null>((lowest, s) => {
    if (!lowest) return s
    return s.purchase_price < lowest.purchase_price ? s : lowest
  }, null)
  const leadTimeDays = preferred?.lead_time_days ?? lowestPrice?.lead_time_days ?? null

  const canEdit = canWrite(user?.role) && !justDeleted

  return (
    <AppLayout>
      <PageHeader
        title={material.name}
        subtitle={material.code}
        actions={
          canEdit ? (
            <>
              <Button
                variant="primary"
                size="sm"
                className="!w-9 !px-0"
                onClick={() => navigate(`/raw-materials/${materialId}/edit`)}
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
            <button type="button" onClick={handleRestore} className="font-medium text-gold-300 underline">Undo</button>
          )}
        </div>
      )}

      {/* Compact summary strip -- the "useful summaries" every section
          below drills into, kept visible regardless of which tab is open. */}
      <GlassCard className="mb-6 p-6">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={material.status} />
          <Badge tone="info">{MATERIAL_TYPE_LABELS[material.material_type] ?? material.material_type}</Badge>
          {material.category && <Badge tone="neutral">{material.category}</Badge>}
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-6 sm:grid-cols-4 lg:grid-cols-7">
          <Field
            label="On hand"
            value={stock ? `${stock.quantity_on_hand} ${material.unit}` : '—'}
          />
          <Field
            label="Available"
            value={
              stock ? (
                <span className={stock.quantity_available < 0 ? 'text-red-300' : undefined}>
                  {stock.quantity_available} {material.unit}
                </span>
              ) : (
                '—'
              )
            }
          />
          <Field label="Reorder point" value={`${material.reorder_point} ${material.unit}`} />
          <Field
            label="Preferred supplier"
            value={preferred ? (preferred.supplier_code ? `${preferred.supplier_code} — ${preferred.supplier_name}` : preferred.supplier_name) : '—'}
          />
          <Field label="Supplier count" value={suppliers ? activeSuppliers.length : '—'} />
          <Field
            label="Lowest price"
            value={lowestPrice ? moneyIn(lowestPrice.purchase_price, lowestPrice.currency) : '—'}
          />
          <Field label="Lead time" value={leadTimeDays != null ? `${leadTimeDays} days` : '—'} />
        </dl>
      </GlassCard>

      <Tabs items={TABS} activeId={activeTab} onChange={setActiveTab} className="mb-6" />

      <TabPanel id="overview" activeId={activeTab}>
        <GlassCard className="p-8">
          <dl className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <Field label="Unit" value={material.unit} />
            <Field label="Material type" value={MATERIAL_TYPE_LABELS[material.material_type] ?? material.material_type} />
            <Field label="Category" value={material.category} />
            <Field label="Manufacturer / brand" value={material.manufacturer} />
            <Field label="Manufacturer part number" value={material.manufacturer_part_number} />
            <Field label="Status" value={<StatusBadge status={material.status} />} />
          </dl>
          {material.description && (
            <div className="mt-6 border-t border-white/10 pt-6">
              <span className="mb-2 block text-xs tracking-wide text-white/40 uppercase">Description</span>
              <p className="text-sm whitespace-pre-wrap text-white/80">{material.description}</p>
            </div>
          )}
        </GlassCard>
      </TabPanel>

      <TabPanel id="stock" activeId={activeTab}>
        <GlassCard className="p-8">
          <dl className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <Field label="On hand" value={stock ? `${stock.quantity_on_hand} ${material.unit}` : '—'} />
            <Field label="Reserved" value={stock ? `${stock.quantity_reserved} ${material.unit}` : '—'} />
            <Field
              label="Available"
              value={
                stock ? (
                  <span className={stock.quantity_available < 0 ? 'text-red-300' : undefined}>
                    {stock.quantity_available} {material.unit}
                  </span>
                ) : (
                  '—'
                )
              }
            />
            <Field label="Reorder point" value={`${material.reorder_point} ${material.unit}`} />
            <Field label="Safety stock" value={`${material.safety_stock} ${material.unit}`} />
            <Field label="Maximum stock" value={material.maximum_stock > 0 ? `${material.maximum_stock} ${material.unit}` : 'No ceiling set'} />
            <Field label="Storage location" value={material.storage_location} />
          </dl>
        </GlassCard>
      </TabPanel>

      <TabPanel id="procurement" activeId={activeTab} keepMounted>
        <MaterialSuppliersPanel rawMaterialId={materialId} canEdit={canEdit} onChange={handleSuppliersChange} />
      </TabPanel>

      <TabPanel id="specification" activeId={activeTab}>
        <GlassCard className="p-8">
          {material.properties && Object.keys(material.properties).length > 0 ? (
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
              {Object.entries(material.properties).map(([key, value]) => (
                <div key={key} className="flex justify-between border-b border-white/5 pb-2 text-sm">
                  <dt className="text-white/50">{key}</dt>
                  <dd className="text-white">{value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="py-6 text-center text-sm text-white/40">No specification attributes recorded yet.</p>
          )}
        </GlassCard>
      </TabPanel>

      <TabPanel id="alternatives" activeId={activeTab}>
        <MaterialAlternativesPanel rawMaterialId={materialId} canEdit={canEdit} />
      </TabPanel>

      <TabPanel id="where-used" activeId={activeTab}>
        <WhereUsedPanel resourcePath="/api/raw-materials" id={materialId} />
      </TabPanel>

      <TabPanel id="quality" activeId={activeTab}>
        <GlassCard className="p-8">
          <dl className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <Field label="Inspection required" value={material.inspection_required ? 'Yes' : 'No'} />
            <Field label="Certificate required" value={material.certificate_required ? 'Yes' : 'No'} />
          </dl>
          {material.qc_notes && (
            <div className="mt-6 border-t border-white/10 pt-6">
              <span className="mb-2 block text-xs tracking-wide text-white/40 uppercase">Acceptance specification / notes</span>
              <p className="text-sm whitespace-pre-wrap text-white/80">{material.qc_notes}</p>
            </div>
          )}
        </GlassCard>
      </TabPanel>

      <TabPanel id="purchasing" activeId={activeTab}>
        <GlassCard className="p-8">
          <dl className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <Field label="Baseline unit cost" value={formatCurrency(material.unit_cost)} />
            <Field label="Default supplier" value={defaultSupplierName} />
          </dl>
          <p className="mt-4 text-xs text-white/40">
            Supplier-specific pricing lives on the Procurement tab -- baseline unit cost here is used for inventory
            valuation and as a purchase order default when a supplier price isn't set.
          </p>
        </GlassCard>
      </TabPanel>

      <TabPanel id="history" activeId={activeTab}>
        <HistoryTimeline resourcePath="/api/raw-materials" id={materialId} />
      </TabPanel>

      <div className="mt-6">
        <Link to="/raw-materials" className="text-sm text-white/50 hover:text-white">← Back to raw materials</Link>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Delete raw material"
        message={`Delete ${material.name}? This can be undone immediately after, but not once you leave this page.`}
        confirmLabel="Delete"
        danger
        busy={busy}
        onConfirm={handleDelete}
        onCancel={() => setConfirmOpen(false)}
      />
    </AppLayout>
  )
}
