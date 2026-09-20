import { useEffect, useState } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'
import { useClientPagination } from '@/hooks/useClientPagination'
import { Alert, EmptyState, GlassCard, PageHeader, Pagination, Spinner, StatusBadge } from '@/components/ui'
import { getReconciliationExceptions } from '@/api/reconciliation'
import type { ReconciliationException } from '@/types/reconciliation'
import { getApiErrorMessage } from '@/lib/apiError'

/** P10 -- compact reconciliation view. Deliberately not a dashboard: no
 * charts, no drilldowns, just the exact table shape the spec calls for
 * (Area / Document / Product-or-Material / Expected / Actual /
 * Difference / Status), read straight from reconciliation_service's
 * deterministic checks. A healthy system shows an empty list -- that's
 * the goal, not a failure state. */
export function ReconciliationPage() {
  const [exceptions, setExceptions] = useState<ReconciliationException[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const exceptionsPager = useClientPagination(exceptions)

  function load() {
    setLoading(true)
    setError(null)
    getReconciliationExceptions()
      .then(setExceptions)
      .catch((err) => setError(getApiErrorMessage(err)))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  return (
    <AppLayout>
      <PageHeader
        title="Reconciliation"
        subtitle="Quantities that should match across production, materials, QC, FG stock, orders and delivery, but currently don't."
      />

      <Alert variant="error">{error}</Alert>

      <GlassCard className="overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16">
            <Spinner size={24} className="text-gold-300" />
          </div>
        ) : !exceptions || exceptions.length === 0 ? (
          <EmptyState
            title="No exceptions found"
            message="Every quantity checked reconciles -- production, material allocation/consumption, QC, and delivery all agree with what they should."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-xs tracking-wide text-white/40 uppercase">
                  <th className="px-6 py-4 font-medium">Area</th>
                  <th className="px-6 py-4 font-medium">Document</th>
                  <th className="px-6 py-4 font-medium">Product/Material</th>
                  <th className="px-6 py-4 font-medium">Expected</th>
                  <th className="px-6 py-4 font-medium">Actual</th>
                  <th className="px-6 py-4 font-medium">Difference</th>
                  <th className="px-6 py-4 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {exceptionsPager.pageItems.map((e, i) => (
                  <tr key={i} className="border-b border-white/5 last:border-0">
                    <td className="px-6 py-4 text-white">{e.area}</td>
                    <td className="px-6 py-4 text-white/60">{e.document}</td>
                    <td className="px-6 py-4 text-white/60">{e.product_or_material}</td>
                    <td className="px-6 py-4 text-white/60">{e.expected}</td>
                    <td className="px-6 py-4 text-white/60">{e.actual}</td>
                    <td className="px-6 py-4 text-white/60">
                      {e.difference > 0 ? '+' : ''}
                      {e.difference}
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={e.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination className="px-6 pb-4" {...exceptionsPager.pagerProps} />
      </GlassCard>
    </AppLayout>
  )
}
