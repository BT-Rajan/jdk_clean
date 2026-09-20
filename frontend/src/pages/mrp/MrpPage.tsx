import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { useClientPagination } from '@/hooks/useClientPagination'
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  GlassCard,
  PageHeader,
  Pagination,
  Spinner,
  TabPanel,
  Tabs,
} from '@/components/ui'
import type { TabItem } from '@/components/ui'
import { createPoForShortage, getMrpReport } from '@/api/mrp'
import { autoDraftFromMrp } from '@/api/purchaseOrders'
import type { MrpReport, MrpSource, MrpSourceGroup, MrpSuggestedPurchase } from '@/types/mrp'
import { getApiErrorMessage } from '@/lib/apiError'
import { formatDate, formatDateTime } from '@/lib/dateFormat'
import { useAuth } from '@/hooks/useAuth'
import { canWriteDepartment } from '@/lib/roles'

function sourceLink(source: MrpSource): { to: string; label: string } | null {
  if (source.source_type === 'production_order' && source.production_order_id) {
    return { to: `/production-orders/${source.production_order_id}`, label: source.production_order_number ?? `#${source.production_order_id}` }
  }
  if (source.source_type === 'legacy_batch' && source.schedule_id) {
    return { to: `/production/${source.schedule_id}`, label: source.batch_number ?? `#${source.schedule_id}` }
  }
  if (source.source_type === 'order' && source.order_id) {
    return { to: `/orders/${source.order_id}`, label: source.order_number ?? `#${source.order_id}` }
  }
  return null
}

function groupLink(group: MrpSourceGroup): { to: string; label: string } | null {
  if (group.source_type === 'production_order' && group.id) {
    return { to: `/production-orders/${group.id}`, label: group.label ?? `#${group.id}` }
  }
  if (group.source_type === 'legacy_batch' && group.id) {
    return { to: `/production/${group.id}`, label: group.label ?? `#${group.id}` }
  }
  if (group.source_type === 'order' && group.id) {
    return { to: `/orders/${group.id}`, label: group.label ?? `#${group.id}` }
  }
  return null
}

const TABS: TabItem[] = [
  { id: 'material', label: 'By material' },
  { id: 'source', label: 'By production order' },
]

export function MrpPage() {
  const { user } = useAuth()
  const allowWrite = canWriteDepartment(user, 'procurement')
  const [report, setReport] = useState<MrpReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [drafting, setDrafting] = useState(false)
  const [draftedIds, setDraftedIds] = useState<number[] | null>(null)
  const [activeTab, setActiveTab] = useState('material')
  const [createPoBusyKey, setCreatePoBusyKey] = useState<string | null>(null)
  const [createdPo, setCreatedPo] = useState<{ materialId: number; poNumber: string } | null>(null)
  const itemsPager = useClientPagination(report?.items)
  const sourcesPager = useClientPagination(report?.by_source)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    getMrpReport()
      .then(setReport)
      .catch((err) => setError(getApiErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [])

  useEffect(load, [load])

  async function handleDraftPurchaseOrders() {
    setDrafting(true)
    setError(null)
    setDraftedIds(null)
    try {
      const result = await autoDraftFromMrp()
      setDraftedIds(result.purchase_order_ids)
      load() // shortages just covered by a new draft PO drop off the report
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setDrafting(false)
    }
  }

  async function handleCreatePo(rawMaterialId: number, suggestion: MrpSuggestedPurchase) {
    const key = `${rawMaterialId}-${suggestion.supplier_id}`
    setCreatePoBusyKey(key)
    setError(null)
    try {
      const po = await createPoForShortage({
        raw_material_id: rawMaterialId,
        supplier_id: suggestion.supplier_id,
        quantity: suggestion.quantity,
      })
      setCreatedPo({ materialId: rawMaterialId, poNumber: po.po_number })
      load() // the new PO becomes confirmed incoming stock -- recalculate the shortage now
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setCreatePoBusyKey(null)
    }
  }

  const hasCoverableShortage = report?.items.some((item) => item.suggested_purchases.length > 0) ?? false

  return (
    <AppLayout>
      <PageHeader
        title="Material requirements planning"
        subtitle="Raw material shortfalls against scheduled production and outstanding orders, netted against available stock and confirmed incoming purchase orders"
        actions={
          <>
            <Button variant="ghost" onClick={load} isLoading={loading}>
              Refresh
            </Button>
            {allowWrite && hasCoverableShortage && (
              <Button onClick={handleDraftPurchaseOrders} isLoading={drafting}>
                Draft purchase orders
              </Button>
            )}
          </>
        }
      />

      <Alert variant="error">{error}</Alert>

      {draftedIds && (
        <Alert variant="success">
          {draftedIds.length === 0
            ? 'Nothing new to draft -- every shortage with known supplier coverage already has a pending purchase order.'
            : (
              <>
                Drafted {draftedIds.length} purchase order{draftedIds.length === 1 ? '' : 's'}, one per supplier --
                review and send from{' '}
                {draftedIds.map((id, i) => (
                  <span key={id}>
                    {i > 0 ? ', ' : ''}
                    <Link to={`/purchase-orders/${id}`} className="underline hover:text-white">
                      PO #{id}
                    </Link>
                  </span>
                ))}
                .
              </>
            )}
        </Alert>
      )}

      {report && !loading && (
        <p className="mb-4 text-xs text-white/40">
          Generated {formatDateTime(report.generated_at)}
        </p>
      )}

      <Tabs items={TABS} activeId={activeTab} onChange={setActiveTab} className="mb-6" />

      <TabPanel id="material" activeId={activeTab}>
        <GlassCard className="overflow-hidden">
          {loading && !report ? (
            <div className="flex justify-center py-16">
              <Spinner size={24} className="text-gold-300" />
            </div>
          ) : !report || report.items.length === 0 ? (
            <EmptyState
              title="No shortfalls"
              message="Everything currently on order and scheduled for production can be covered by stock on hand."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-xs tracking-wide text-white/40 uppercase">
                    <th className="px-6 py-4 font-medium">Material</th>
                    <th className="px-6 py-4 font-medium">Required</th>
                    <th className="px-6 py-4 font-medium">Available</th>
                    <th className="px-6 py-4 font-medium">Confirmed incoming</th>
                    <th className="px-6 py-4 font-medium">Shortfall</th>
                    <th className="px-6 py-4 font-medium">Suggested purchases</th>
                  </tr>
                </thead>
                <tbody>
                  {itemsPager.pageItems.map((item) => {
                    const atRisk = item.sources.some((s) => s.at_risk)
                    return (
                      <tr key={item.raw_material_id} className="border-b border-white/5 last:border-0 align-top">
                        <td className="px-6 py-4">
                          <Link
                            to={`/raw-materials/${item.raw_material_id}`}
                            className="font-medium text-gold-300 hover:text-gold-200"
                          >
                            {item.code} — {item.name}
                          </Link>
                          <p className="mt-0.5 text-xs text-white/40">Reorder point: {item.reorder_point} {item.unit}</p>
                          <ul className="mt-2 flex flex-col gap-1">
                            {item.sources.map((source, i) => {
                              const link = sourceLink(source)
                              return (
                                <li key={i} className={`text-xs ${source.at_risk ? 'text-red-300' : 'text-white/50'}`}>
                                  {link ? (
                                    <Link to={link.to} className="underline hover:text-white">
                                      {link.label}
                                    </Link>
                                  ) : (
                                    '—'
                                  )}
                                  {' '}
                                  ({source.required_quantity.toLocaleString()} {item.unit})
                                  {source.required_by_date && ` · needed by ${formatDate(source.required_by_date)}`}
                                  {source.at_risk && ' · at risk'}
                                </li>
                              )
                            })}
                          </ul>
                        </td>
                        <td className="px-6 py-4 text-white">
                          {item.total_required.toLocaleString()} {item.unit}
                        </td>
                        <td className="px-6 py-4 text-white/60">
                          {item.available_quantity.toLocaleString()} {item.unit}
                        </td>
                        <td className="px-6 py-4 text-white/60">
                          {item.confirmed_incoming_quantity > 0 ? (
                            <>
                              <p>{item.confirmed_incoming_quantity.toLocaleString()} {item.unit}</p>
                              <ul className="mt-1 flex flex-col gap-1">
                                {item.incoming_purchase_orders.map((po) => (
                                  <li key={po.purchase_order_id} className="text-xs text-white/40">
                                    <Link
                                      to={`/purchase-orders/${po.purchase_order_id}`}
                                      className="text-gold-300 hover:text-gold-200"
                                    >
                                      {po.po_number}
                                    </Link>
                                    {': '}
                                    {po.quantity.toLocaleString()} {item.unit}
                                    {po.expected_delivery_date && ` · due ${formatDate(po.expected_delivery_date)}`}
                                  </li>
                                ))}
                              </ul>
                            </>
                          ) : (
                            <span className="text-xs text-white/30">None</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <Badge tone={item.shortfall > 0 ? 'danger' : 'success'}>
                            {item.shortfall > 0
                              ? `${item.shortfall.toLocaleString()} ${item.unit}`
                              : 'Covered by incoming'}
                          </Badge>
                          {item.date_known && item.expected_available_date && (
                            <p className="mt-1.5 text-xs text-white/40">
                              Available {formatDate(item.expected_available_date)}
                            </p>
                          )}
                          {!item.date_known && item.shortfall > 0 && (
                            <p className="mt-1.5 text-xs text-amber-300">No reliable procurement date</p>
                          )}
                          {atRisk && <Badge tone="danger">At risk of missing date</Badge>}
                        </td>
                        <td className="px-6 py-4">
                          {item.fully_covered_by_incoming ? (
                            <span className="text-xs text-emerald-300">
                              Already covered -- no new purchase needed.
                            </span>
                          ) : item.suggested_purchases.length === 0 ? (
                            <span className="text-xs text-white/40">No known supplier for this material</span>
                          ) : (
                            <ul className="flex flex-col gap-1.5">
                              {item.suggested_purchases.map((p) => {
                                const key = `${item.raw_material_id}-${p.supplier_id}`
                                return (
                                  <li key={p.supplier_id} className="text-xs text-white/70">
                                    <Link to={`/suppliers/${p.supplier_id}`} className="text-gold-300 hover:text-gold-200">
                                      {p.supplier_name}
                                    </Link>
                                    {': '}
                                    {p.quantity.toLocaleString()} {item.unit}
                                    {p.lead_time_days != null && <> · {p.lead_time_days}d lead</>}
                                    {' · '}
                                    {allowWrite && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        isLoading={createPoBusyKey === key}
                                        onClick={() => handleCreatePo(item.raw_material_id, p)}
                                      >
                                        Create PO
                                      </Button>
                                    )}
                                  </li>
                                )
                              })}
                            </ul>
                          )}
                          {!item.fully_covered && (
                            <p className="mt-1.5 text-xs text-red-300">
                              {item.uncovered_quantity.toLocaleString()} {item.unit} has no known supplier coverage
                            </p>
                          )}
                          {createdPo && createdPo.materialId === item.raw_material_id && (
                            <p className="mt-1.5 text-xs text-emerald-300">Created {createdPo.poNumber}.</p>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          <Pagination className="px-6 pb-4" {...itemsPager.pagerProps} />
        </GlassCard>
      </TabPanel>

      <TabPanel id="source" activeId={activeTab}>
        <GlassCard className="overflow-hidden">
          {loading && !report ? (
            <div className="flex justify-center py-16">
              <Spinner size={24} className="text-gold-300" />
            </div>
          ) : !report || report.by_source.length === 0 ? (
            <EmptyState
              title="No shortfalls"
              message="No production order, batch, or customer order is currently short on raw materials."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-xs tracking-wide text-white/40 uppercase">
                    <th className="px-6 py-4 font-medium">Source</th>
                    <th className="px-6 py-4 font-medium">Product</th>
                    <th className="px-6 py-4 font-medium">Needed by</th>
                    <th className="px-6 py-4 font-medium">Short materials</th>
                  </tr>
                </thead>
                <tbody>
                  {sourcesPager.pageItems.map((group, i) => {
                    const link = groupLink(group)
                    return (
                      <tr key={i} className="border-b border-white/5 last:border-0 align-top">
                        <td className="px-6 py-4">
                          {link ? (
                            <Link to={link.to} className="font-medium text-gold-300 hover:text-gold-200">
                              {link.label}
                            </Link>
                          ) : (
                            group.label ?? '—'
                          )}
                          {group.at_risk && (
                            <div className="mt-1">
                              <Badge tone="danger">At risk of missing date</Badge>
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 text-white/60">{group.product_name ?? `#${group.product_id}`}</td>
                        <td className="px-6 py-4 text-white/60">
                          {group.required_by_date ? formatDate(group.required_by_date) : '—'}
                        </td>
                        <td className="px-6 py-4">
                          <ul className="flex flex-col gap-1">
                            {group.materials.map((m) => (
                              <li key={m.raw_material_id} className="text-xs text-white/70">
                                <Link to={`/raw-materials/${m.raw_material_id}`} className="text-gold-300 hover:text-gold-200">
                                  {m.code} — {m.name}
                                </Link>
                                {': needs '}
                                {m.required_quantity.toLocaleString()} {m.unit}
                                {' · '}
                                <span className={m.fully_covered ? 'text-emerald-300' : 'text-red-300'}>
                                  {m.fully_covered ? 'covered' : `${m.shortfall.toLocaleString()} ${m.unit} short overall`}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          <Pagination className="px-6 pb-4" {...sourcesPager.pagerProps} />
        </GlassCard>
      </TabPanel>
    </AppLayout>
  )
}
