import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { Alert, Badge, Button, EmptyState, GlassCard, PageHeader, Spinner } from '@/components/ui'
import { getMrpReport } from '@/api/mrp'
import { autoDraftFromMrp } from '@/api/purchaseOrders'
import type { MrpReport } from '@/types/mrp'
import { getApiErrorMessage } from '@/lib/apiError'
import { formatDateTime } from '@/lib/dateFormat'
import { useAuth } from '@/hooks/useAuth'
import { canWriteDepartment } from '@/lib/roles'

export function MrpPage() {
  const { user } = useAuth()
  const allowWrite = canWriteDepartment(user, 'procurement')
  const [report, setReport] = useState<MrpReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [drafting, setDrafting] = useState(false)
  const [draftedIds, setDraftedIds] = useState<number[] | null>(null)

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

  const hasCoverableShortage = report?.items.some((item) => item.suggested_purchases.length > 0) ?? false

  return (
    <AppLayout>
      <PageHeader
        title="Material requirements planning"
        subtitle="Raw material shortfalls against scheduled production and outstanding orders, netted against current stock"
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
                  <th className="px-6 py-4 font-medium">On hand</th>
                  <th className="px-6 py-4 font-medium">Shortfall</th>
                  <th className="px-6 py-4 font-medium">Suggested purchases</th>
                  <th className="px-6 py-4 font-medium">Coverage</th>
                </tr>
              </thead>
              <tbody>
                {report.items.map((item) => (
                  <tr key={item.raw_material_id} className="border-b border-white/5 last:border-0 align-top">
                    <td className="px-6 py-4">
                      <Link
                        to={`/raw-materials/${item.raw_material_id}`}
                        className="font-medium text-gold-300 hover:text-gold-200"
                      >
                        {item.code} — {item.name}
                      </Link>
                      <p className="mt-0.5 text-xs text-white/40">Reorder point: {item.reorder_point} {item.unit}</p>
                    </td>
                    <td className="px-6 py-4 text-white">
                      {item.total_required.toLocaleString()} {item.unit}
                    </td>
                    <td className="px-6 py-4 text-white/60">
                      {item.current_on_hand.toLocaleString()} {item.unit}
                    </td>
                    <td className="px-6 py-4">
                      <Badge tone="danger">{`${item.shortfall.toLocaleString()} ${item.unit}`}</Badge>
                    </td>
                    <td className="px-6 py-4">
                      {item.suggested_purchases.length === 0 ? (
                        <span className="text-xs text-white/40">No known supplier for this material</span>
                      ) : (
                        <ul className="flex flex-col gap-1.5">
                          {item.suggested_purchases.map((p) => (
                            <li key={p.supplier_id} className="text-xs text-white/70">
                              <Link to={`/suppliers/${p.supplier_id}`} className="text-gold-300 hover:text-gold-200">
                                {p.supplier_name}
                              </Link>
                              {': '}
                              {p.quantity.toLocaleString()} {item.unit}
                              {p.lead_time_days != null && <> · {p.lead_time_days}d lead</>}
                              {' · '}
                              <Link
                                to={`/purchase-orders/new?supplier_id=${p.supplier_id}&raw_material_id=${item.raw_material_id}&quantity=${p.quantity}`}
                                className="text-white/50 underline hover:text-white"
                              >
                                Create PO
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                      {!item.fully_covered && (
                        <p className="mt-1.5 text-xs text-red-300">
                          {item.uncovered_quantity.toLocaleString()} {item.unit} has no known supplier coverage
                        </p>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <Badge tone={item.fully_covered ? 'success' : 'danger'}>
                        {item.fully_covered ? 'Fully covered' : 'Gap remains'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>
    </AppLayout>
  )
}
