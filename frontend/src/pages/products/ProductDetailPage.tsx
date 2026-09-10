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
import { MultiHistoryTimeline } from '@/components/history/MultiHistoryTimeline'
import { WhereUsedPanel } from '@/components/master/WhereUsedPanel'
import { activateProduct, deactivateProduct, deleteProduct, getProduct, restoreProduct } from '@/api/products'
import { getStock } from '@/api/inventory'
import { getMachine } from '@/api/machines'
import type { Product } from '@/types/product'
import type { StockLevel } from '@/types/inventory'
import type { Machine } from '@/types/machine'
import { getApiErrorMessage } from '@/lib/apiError'
import { useAuth } from '@/hooks/useAuth'
import { canWrite, isAdmin } from '@/lib/roles'
import { formatCurrency } from '@/lib/currency'
import { clampNonNegativeString } from '@/lib/number'
import { BomEditor } from './BomEditor'
import { PackagingEditor } from './PackagingEditor'
import { SupplierDrilldown } from './SupplierDrilldown'

const PRODUCT_TYPE_LABELS: Record<string, string> = {
  finished_good: 'Finished good',
  sub_assembly: 'Sub-assembly',
}

const TABS: TabItem[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'stock-production', label: 'Stock & production' },
  { id: 'bom', label: 'Bill of materials' },
  { id: 'packaging', label: 'Packaging' },
  { id: 'specifications', label: 'Specifications' },
  { id: 'sourcing', label: 'Sourcing' },
  { id: 'quality', label: 'Quality control' },
  { id: 'where-used', label: 'Where used' },
  { id: 'history', label: 'History' },
]

export function ProductDetailPage() {
  const { id } = useParams()
  const productId = Number(id)
  const navigate = useNavigate()
  const { user } = useAuth()

  const [product, setProduct] = useState<Product | null>(null)
  const [machine, setMachine] = useState<Machine | null>(null)
  const [stock, setStock] = useState<StockLevel | null>(null)
  const [componentCount, setComponentCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [justDeleted, setJustDeleted] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState('overview')
  const [estimateQty, setEstimateQty] = useState('1')

  useEffect(() => {
    getProduct(productId)
      .then((p) => {
        setProduct(p)
        if (p.machine_id) {
          getMachine(p.machine_id).then(setMachine).catch(() => {})
        }
      })
      .catch((err) => setError(getApiErrorMessage(err)))
      .finally(() => setLoading(false))
    getStock('product', productId)
      .then(setStock)
      .catch(() => {})
  }, [productId])

  const handleBomChange = useCallback((count: number) => setComponentCount(count), [])

  async function handleDelete() {
    setBusy(true)
    try {
      await deleteProduct(productId)
      setConfirmOpen(false)
      setJustDeleted(true)
      setNotice('Product deleted.')
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleRestore() {
    setBusy(true)
    try {
      const restored = await restoreProduct(productId)
      setProduct(restored)
      setJustDeleted(false)
      setNotice('Product restored.')
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleToggleStatus() {
    if (!product) return
    setBusy(true)
    try {
      const updated = product.status === 'active' ? await deactivateProduct(productId) : await activateProduct(productId)
      setProduct(updated)
      setNotice(updated.status === 'active' ? 'Product activated.' : 'Product deactivated.')
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

  if (!product) {
    return (
      <AppLayout>
        <Alert variant="error">{error ?? 'Product not found.'}</Alert>
      </AppLayout>
    )
  }

  const canEdit = canWrite(user?.role) && !justDeleted
  const estimatedHours = product.production_hours_per_unit != null ? (Number(estimateQty) || 0) * product.production_hours_per_unit : null
  const estimatedDays =
    estimatedHours != null && machine?.capacity_hours_per_day ? estimatedHours / machine.capacity_hours_per_day : null

  return (
    <AppLayout>
      <PageHeader
        title={product.name}
        subtitle={product.code}
        actions={
          canEdit ? (
            <>
              <Button variant="ghost" onClick={handleToggleStatus} isLoading={busy}>
                {product.status === 'active' ? 'Deactivate' : 'Activate'}
              </Button>
              <Button
                variant="primary"
                size="sm"
                className="!w-9 !px-0"
                onClick={() => navigate(`/products/${productId}/edit`)}
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

      {/* Compact summary strip -- same pattern as the Raw Material detail
          page: the "useful summaries" every section below drills into. */}
      <GlassCard className="mb-6 p-6">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={product.status} />
          <Badge tone={product.product_type === 'finished_good' ? 'gold' : 'info'}>
            {PRODUCT_TYPE_LABELS[product.product_type] ?? product.product_type}
          </Badge>
          {product.category && <Badge tone="neutral">{product.category}</Badge>}
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-6">
          <Field
            label="On hand"
            value={stock ? `${stock.quantity_on_hand} ${product.unit}` : '—'}
          />
          <Field
            label="Available"
            value={
              stock ? (
                <span className={stock.quantity_available < 0 ? 'text-red-300' : undefined}>
                  {stock.quantity_available} {product.unit}
                </span>
              ) : (
                '—'
              )
            }
          />
          <Field label="Reorder point" value={`${product.reorder_point} ${product.unit}`} />
          <Field label="Components" value={componentCount != null ? componentCount : '—'} />
          <Field label="Production hrs/unit" value={product.production_hours_per_unit ?? '—'} />
          <Field label="Selling price" value={formatCurrency(product.selling_price)} />
        </dl>
      </GlassCard>

      <Tabs items={TABS} activeId={activeTab} onChange={setActiveTab} className="mb-6" />

      <TabPanel id="overview" activeId={activeTab}>
        <GlassCard className="p-8">
          <dl className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <Field label="Unit" value={product.unit} />
            <Field label="Product type" value={PRODUCT_TYPE_LABELS[product.product_type] ?? product.product_type} />
            <Field label="Category" value={product.category} />
            <Field label="Status" value={<StatusBadge status={product.status} />} />
            <Field label="Selling price" value={formatCurrency(product.selling_price)} />
            <Field label="Batch" value={product.batch_size && product.batch_production_hours != null ? `${product.batch_size} ${product.unit} / ${product.batch_production_hours} hrs` : '—'} />
            <Field label="Production hours per unit" value={product.production_hours_per_unit ?? '—'} />
            <Field label="Machine" value={machine ? `${machine.code} — ${machine.name}` : '—'} />
            <Field label="Workers required" value={product.workers_required ?? '—'} />
          </dl>
          {product.description && (
            <div className="mt-6 border-t border-white/10 pt-6">
              <span className="mb-2 block text-xs tracking-wide text-white/40 uppercase">Description</span>
              <p className="text-sm whitespace-pre-wrap text-white/80">{product.description}</p>
            </div>
          )}
        </GlassCard>
      </TabPanel>

      <TabPanel id="stock-production" activeId={activeTab}>
        <div className="flex flex-col gap-6">
          <GlassCard className="p-8">
            <h2 className="mb-4 font-display text-base font-medium text-white">Stock</h2>
            <dl className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <Field label="On hand" value={stock ? `${stock.quantity_on_hand} ${product.unit}` : '—'} />
              <Field label="Reserved" value={stock ? `${stock.quantity_reserved} ${product.unit}` : '—'} />
              <Field
                label="Available"
                value={
                  stock ? (
                    <span className={stock.quantity_available < 0 ? 'text-red-300' : undefined}>
                      {stock.quantity_available} {product.unit}
                    </span>
                  ) : (
                    '—'
                  )
                }
              />
              <Field label="Reorder point" value={`${product.reorder_point} ${product.unit}`} />
            </dl>
          </GlassCard>

          <GlassCard className="p-8">
            <h2 className="mb-4 font-display text-base font-medium text-white">Production</h2>
            <dl className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <Field label="Batch size" value={product.batch_size ? `${product.batch_size} ${product.unit}` : '—'} />
              <Field label="Production time / batch" value={product.batch_production_hours != null ? `${product.batch_production_hours} hrs` : '—'} />
              <Field label="Machine" value={machine ? `${machine.code} — ${machine.name}` : '—'} />
              <Field label="Workers required" value={product.workers_required ?? '—'} />
              <Field label="Production hours / unit" value={product.production_hours_per_unit ?? '—'} />
            </dl>

            {product.production_hours_per_unit != null && (
              <div className="mt-6 border-t border-white/10 pt-6">
                <h3 className="mb-3 text-sm font-medium text-white/70">Estimated production time</h3>
                <div className="flex flex-wrap items-end gap-4">
                  <div className="w-40">
                    <label className="mb-1.5 block text-xs font-medium uppercase tracking-[0.14em] text-white/55">Quantity</label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={estimateQty}
                      onChange={(e) => setEstimateQty(clampNonNegativeString(e.target.value))}
                      className="glass-inset w-full rounded-xl px-4 py-3 text-[15px] text-white outline-none"
                    />
                  </div>
                  <div className="text-sm text-white/70">
                    {estimatedHours != null && (
                      <>
                        ≈ <span className="text-white">{estimatedHours.toLocaleString()}</span> machine hours
                        {estimatedDays != null && (
                          <>
                            {' '}
                            (~<span className="text-white">{estimatedDays.toFixed(1)}</span> production days at{' '}
                            {machine?.capacity_hours_per_day}h/day)
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>
                <p className="mt-2 text-xs text-white/40">
                  Quantity × production hours/unit. Does not account for other batches already booked against this
                  machine -- see Production for actual scheduling.
                </p>
              </div>
            )}
          </GlassCard>
        </div>
      </TabPanel>

      <TabPanel id="bom" activeId={activeTab} keepMounted>
        {isAdmin(user?.role) ? (
          <BomEditor productId={productId} canEdit={canEdit} onChange={handleBomChange} />
        ) : (
          <GlassCard className="p-8 text-sm text-white/50">
            The bill of materials is visible to admins only.
          </GlassCard>
        )}
      </TabPanel>

      <TabPanel id="packaging" activeId={activeTab}>
        <PackagingEditor productId={productId} canEdit={canEdit} />
      </TabPanel>

      <TabPanel id="specifications" activeId={activeTab}>
        <GlassCard className="p-8">
          {product.tags && product.tags.length > 0 && (
            <div className="mb-6">
              <span className="mb-2 block text-xs tracking-wide text-white/40 uppercase">Tags</span>
              <div className="flex flex-wrap gap-2">
                {product.tags.map((tag) => (
                  <Badge key={tag} tone="info">{tag}</Badge>
                ))}
              </div>
            </div>
          )}
          {product.properties && Object.keys(product.properties).length > 0 ? (
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
              {Object.entries(product.properties).map(([key, value]) => (
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

      <TabPanel id="sourcing" activeId={activeTab}>
        {isAdmin(user?.role) ? (
          <SupplierDrilldown productId={productId} />
        ) : (
          <GlassCard className="p-8 text-sm text-white/50">Sourcing information is visible to admins only.</GlassCard>
        )}
      </TabPanel>

      <TabPanel id="quality" activeId={activeTab}>
        <GlassCard className="p-8">
          <dl className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <Field label="Inspection required" value={product.inspection_required ? 'Yes' : 'No'} />
          </dl>
          {product.qc_notes && (
            <div className="mt-6 border-t border-white/10 pt-6">
              <span className="mb-2 block text-xs tracking-wide text-white/40 uppercase">Acceptance specification / notes</span>
              <p className="text-sm whitespace-pre-wrap text-white/80">{product.qc_notes}</p>
            </div>
          )}
        </GlassCard>
      </TabPanel>

      <TabPanel id="where-used" activeId={activeTab}>
        <WhereUsedPanel resourcePath="/api/products" id={productId} />
      </TabPanel>

      <TabPanel id="history" activeId={activeTab}>
        <MultiHistoryTimeline
          sources={[
            { id: 'product', label: 'Product', resourcePath: '/api/products', entityId: productId },
            ...(isAdmin(user?.role)
              ? [{ id: 'bom', label: 'Formula (BOM)', url: `/api/products/${productId}/bom/history` }]
              : []),
            { id: 'packaging', label: 'Packaging', url: `/api/products/${productId}/packaging/history` },
          ]}
        />
      </TabPanel>

      <div className="mt-6">
        <Link to="/products" className="text-sm text-white/50 hover:text-white">← Back to products</Link>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Delete product"
        message={`Delete ${product.name}? This can be undone immediately after, but not once you leave this page.`}
        confirmLabel="Delete"
        danger
        busy={busy}
        onConfirm={handleDelete}
        onCancel={() => setConfirmOpen(false)}
      />
    </AppLayout>
  )
}
