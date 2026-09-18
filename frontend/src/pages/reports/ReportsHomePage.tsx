import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { Alert, GlassCard, PageHeader, Spinner } from '@/components/ui'
import { getDashboardStats } from '@/api/dashboard'
import type { DashboardStatsResponse } from '@/types/dashboard'
import { getApiErrorMessage } from '@/lib/apiError'
import { formatCurrency } from '@/lib/currency'

interface ReportCard {
  to: string
  title: string
  description: string
  metrics: { label: string; value: string | number }[]
}

export function ReportsHomePage() {
  const [stats, setStats] = useState<DashboardStatsResponse | null>(null)
  const [statsLoading, setStatsLoading] = useState(true)
  const [statsError, setStatsError] = useState<string | null>(null)

  useEffect(() => {
    getDashboardStats()
      .then(setStats)
      .catch((err) => setStatsError(getApiErrorMessage(err)))
      .finally(() => setStatsLoading(false))
  }, [])

  // Each card's quick metrics reuse the same live dashboard stats the
  // Dashboard and the other module overview pages already pull from GET
  // /api/dashboard -- a glance at where each domain stands before diving
  // into that report's own date-ranged detail and drilldowns.
  const cards: ReportCard[] = [
    {
      to: '/reports/sales-report',
      title: 'Sales Report',
      description: 'Revenue, quotation conversion, and top customers and products over a date range.',
      metrics: [
        { label: 'Orders this month', value: stats?.stats.orders_month?.value ?? '—' },
        { label: 'Quotations this month', value: stats?.stats.quotations_month?.value ?? '—' },
      ],
    },
    {
      to: '/reports/purchasing-report',
      title: 'Purchasing Report',
      description: 'Spend, supplier performance, and purchase order activity over a date range.',
      metrics: [{ label: 'Open purchase orders', value: stats?.stats.purchase_orders_pending?.value ?? '—' }],
    },
    {
      to: '/reports/production-report',
      title: 'Production Report',
      description: 'Output, batch completion, and capacity utilization over a date range.',
      metrics: [
        { label: 'Active batches', value: stats?.stats.production_active?.value ?? '—' },
        { label: 'Completion rate', value: stats?.stats.production_completion?.value ?? '—' },
      ],
    },
    {
      to: '/reports/inventory-report',
      title: 'Inventory Report',
      description: 'Stock value, movement, and low-stock exposure across raw materials and finished goods.',
      metrics: [
        { label: 'Inventory value', value: formatCurrency(stats?.stats.inventory_value?.value) },
        { label: 'Low on stock', value: stats?.stats.low_stock_count?.value ?? '—' },
      ],
    },
  ]

  return (
    <AppLayout>
      <PageHeader title="Reports" subtitle="One home for every module's reports — pick a domain to drill into its full range and detail." />

      <Alert variant="error">{statsError}</Alert>

      {statsLoading ? (
        <div className="flex justify-center py-8">
          <Spinner size={24} className="text-gold-300" />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {cards.map((card) => (
            <Link key={card.to} to={card.to}>
              <GlassCard className="h-full p-6 transition-colors hover:border-gold-400/30 hover:bg-white/[0.07]">
                <h2 className="font-display text-lg font-medium text-white">{card.title}</h2>
                <p className="mt-2 text-sm text-white/50">{card.description}</p>
                <div className="mt-4 flex flex-wrap gap-6">
                  {card.metrics.map((m) => (
                    <div key={m.label}>
                      <p className="text-xl font-semibold text-white">{m.value}</p>
                      <p className="text-xs text-white/40">{m.label}</p>
                    </div>
                  ))}
                </div>
              </GlassCard>
            </Link>
          ))}
        </div>
      )}
    </AppLayout>
  )
}
