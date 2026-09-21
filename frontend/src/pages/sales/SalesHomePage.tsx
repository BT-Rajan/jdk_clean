import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { Alert, Button, GlassCard, PageHeader, Spinner } from '@/components/ui'
import { getSalesHome } from '@/api/salesHome'
import { useAuth } from '@/hooks/useAuth'
import { getApiErrorMessage } from '@/lib/apiError'
import { canWritePage } from '@/lib/roles'
import type { SalesHome } from '@/types/salesHome'

/**
 * The Sales workspace: what needs doing now, not a report. A salesman sees
 * their own customers' work; the Sales Manager / admin see the whole
 * department plus a per-salesman workload table. Everything comes from one
 * server-side call (/api/sales/home) that is already scoped -- analytics
 * live in Reports -> Sales Report.
 */
export function SalesHomePage() {
  const navigate = useNavigate()
  const { permissions } = useAuth()
  const [home, setHome] = useState<SalesHome | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    getSalesHome()
      .then((data) => {
        if (!cancelled) setHome(data)
      })
      .catch((err) => {
        if (!cancelled) setError(getApiErrorMessage(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const isManagerView = home?.scope === 'all'
  const tiles = home
    ? [
        { label: isManagerView ? 'Customers' : 'My customers', value: home.counts.customers, to: '/customers' },
        { label: 'Open feasibility', value: home.counts.open_feasibility, to: '/feasibilities' },
        { label: 'Open quotations', value: home.counts.open_quotations, to: '/quotations' },
        { label: 'Active orders', value: home.counts.active_orders, to: '/orders' },
        // The Sales -> Finance handoff, broken out by stage -- see the
        // "Sales -> Finance Invoice Handoff" design doc's Sales Overview
        // redesign section.
        { label: 'Invoice -> Finance', value: home.counts.invoices_waiting_finance, to: '/invoices' },
        { label: 'Awaiting payment', value: home.counts.invoices_awaiting_payment, to: '/invoices' },
        { label: 'Payment received', value: home.counts.invoices_paid_processing, to: '/invoices' },
        { label: 'Needs attention', value: home.counts.attention, to: null },
      ]
    : []
  const hiddenAttention = home ? home.counts.attention - home.attention.length : 0

  return (
    <AppLayout>
      <PageHeader
        title="Sales"
        subtitle={isManagerView ? 'All customers and sales work across the department.' : 'Your customers and what needs doing next.'}
        actions={
          <>
            {canWritePage(permissions, 'customers') && (
              <Button variant="ghost" onClick={() => navigate('/customers/new')}>New customer</Button>
            )}
            {canWritePage(permissions, 'feasibilities') && (
              <Button onClick={() => navigate('/feasibilities/new')}>New feasibility check</Button>
            )}
          </>
        }
      />

      <Alert variant="error">{error}</Alert>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner size={24} className="text-gold-300" />
        </div>
      ) : home ? (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {tiles.map((tile) => {
              const body = (
                <>
                  <p className="text-xs uppercase tracking-wide text-white/50">{tile.label}</p>
                  <p className="mt-1 font-display text-3xl font-medium text-white">{tile.value}</p>
                </>
              )
              return tile.to ? (
                <Link key={tile.label} to={tile.to} className="block rounded-2xl">
                  <GlassCard className="p-4 transition-colors hover:bg-white/10">{body}</GlassCard>
                </Link>
              ) : (
                <GlassCard key={tile.label} className="p-4">{body}</GlassCard>
              )
            })}
          </div>

          <GlassCard className="overflow-hidden">
            <div className="border-b border-white/10 px-6 py-4">
              <h2 className="font-display text-lg font-medium text-white">Next actions</h2>
            </div>
            {home.attention.length === 0 ? (
              <p className="px-6 py-8 text-center text-sm text-white/50">Nothing needs your attention right now.</p>
            ) : (
              <ul className="divide-y divide-white/10">
                {home.attention.map((item) => (
                  <li key={`${item.kind}-${item.link}`}>
                    <Link to={item.link} className="flex items-center justify-between gap-4 px-6 py-3 hover:bg-white/5">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white">{item.title}</p>
                        <p className="truncate text-xs text-white/50">
                          {item.customer_name} · {item.detail}
                        </p>
                      </div>
                      <span className="shrink-0 text-white/30" aria-hidden="true">›</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {hiddenAttention > 0 && (
              <p className="border-t border-white/10 px-6 py-3 text-xs text-white/50">
                +{hiddenAttention} more -- the most urgent are listed first.
              </p>
            )}
          </GlassCard>

          {isManagerView && (
            <GlassCard className="overflow-hidden">
              <div className="border-b border-white/10 px-6 py-4">
                <h2 className="font-display text-lg font-medium text-white">Salesman workload</h2>
              </div>
              {home.salesmen.length === 0 ? (
                <p className="px-6 py-8 text-center text-sm text-white/50">No salesmen in the Sales department yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-white/50">
                        <th className="px-6 py-3 font-medium">Salesman</th>
                        <th className="px-4 py-3 text-right font-medium">Customers</th>
                        <th className="px-4 py-3 text-right font-medium">Open quotes</th>
                        <th className="px-4 py-3 text-right font-medium">Active orders</th>
                        <th className="px-6 py-3 text-right font-medium">Attention</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/10">
                      {home.salesmen.map((row) => (
                        <tr key={row.user_id ?? 'unassigned'} className={row.user_id === null ? 'bg-amber-500/5' : undefined}>
                          <td className="px-6 py-3">
                            <Link
                              to={`/customers?assigned_to=${row.user_id ?? 'null'}`}
                              className="text-white hover:text-gold-200"
                            >
                              {row.name}
                            </Link>
                            {row.user_id === null && (
                              <span className="ml-2 text-xs text-amber-200">open to assign</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right text-white/80">{row.customers}</td>
                          <td className="px-4 py-3 text-right text-white/80">
                            {row.user_id !== null ? (
                              <Link to={`/quotations?assigned_to=${row.user_id}`} className="hover:text-gold-200">
                                {row.open_quotations}
                              </Link>
                            ) : (
                              row.open_quotations
                            )}
                          </td>
                          <td className="px-4 py-3 text-right text-white/80">
                            {row.user_id !== null ? (
                              <Link to={`/orders?assigned_to=${row.user_id}`} className="hover:text-gold-200">
                                {row.active_orders}
                              </Link>
                            ) : (
                              row.active_orders
                            )}
                          </td>
                          <td className="px-6 py-3 text-right text-white/80">{row.attention}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </GlassCard>
          )}
        </div>
      ) : null}
    </AppLayout>
  )
}
