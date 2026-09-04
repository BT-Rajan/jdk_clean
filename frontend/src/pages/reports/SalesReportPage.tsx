import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { AppLayout } from '@/components/layout/AppLayout'
import { StatsWidget } from '@/components/dashboard/DashboardWidgets'
import {
  Alert,
  Button,
  EmptyState,
  GlassCard,
  PageHeader,
  SelectField,
  Spinner,
  StatusBadge,
  TextField,
} from '@/components/ui'
import { getSalesDrilldown, getSalesReport } from '@/api/reports'
import { todayDateInputMin } from '@/lib/validation/dateRules'
import type {
  SalesDrilldownOrder,
  SalesReport,
  SalesReportMonthly,
  SalesReportStatus,
  SalesReportTopCustomer,
  SalesReportTopProduct,
} from '@/types/reports'
import { getApiErrorMessage } from '@/lib/apiError'
import { formatCurrency } from '@/lib/currency'
import { formatDate } from '@/lib/dateFormat'
import {
  AXIS_TICK,
  GRID_STROKE,
  onBarClick,
  toNumber,
  TOOLTIP_CURSOR,
  TOOLTIP_LABEL_STYLE,
  TOOLTIP_STYLE,
} from './chartHelpers'
import type { NameType, ValueType } from './chartHelpers'

// Mirrors components/ui/Badge.tsx's STATUS_TONES for the statuses an
// order can actually have, so a status bar's color matches its
// StatusBadge color everywhere else in the app.
const STATUS_COLORS: Record<string, string> = {
  draft: '#9aa0ae',
  confirmed: '#34d399',
  in_production: '#d4af6a',
  ready_to_ship: '#d4af6a',
  shipped: '#a78bfa',
  delivered: '#34d399',
  cancelled: '#f87171',
}

interface DrilldownFilter {
  year?: number
  month?: number
  status?: string
  customerId?: number
  productId?: number
  label: string
}

export function SalesReportPage() {
  const [months, setMonths] = useState(12)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [report, setReport] = useState<SalesReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [filter, setFilter] = useState<DrilldownFilter | null>(null)
  const [drilldown, setDrilldown] = useState<SalesDrilldownOrder[] | null>(null)
  const [drilldownLoading, setDrilldownLoading] = useState(false)
  const [drilldownError, setDrilldownError] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    getSalesReport({ months, dateFrom, dateTo })
      .then(setReport)
      .catch((err) => setError(getApiErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [months, dateFrom, dateTo])

  useEffect(load, [load])

  useEffect(() => {
    if (!filter) {
      setDrilldown(null)
      return
    }
    setDrilldownLoading(true)
    setDrilldownError(null)
    getSalesDrilldown({
      year: filter.year,
      month: filter.month,
      status: filter.status,
      customer_id: filter.customerId,
      product_id: filter.productId,
    })
      .then((res) => setDrilldown(res.items))
      .catch((err) => setDrilldownError(getApiErrorMessage(err)))
      .finally(() => setDrilldownLoading(false))
  }, [filter])

  const totals = useMemo(() => {
    if (!report) return null
    return report.monthly.reduce(
      (acc, m) => ({
        revenue: acc.revenue + m.revenue,
        orders: acc.orders + m.order_count,
        quotations: acc.quotations + m.quotation_count,
      }),
      { revenue: 0, orders: 0, quotations: 0 },
    )
  }, [report])

  return (
    <AppLayout>
      <PageHeader
        title="Sales report"
        actions={
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-40">
              <TextField
                label="From date"
                type="date"
                max={dateTo || todayDateInputMin}
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="w-40">
              <TextField
                label="To date"
                type="date"
                min={dateFrom || undefined}
                max={todayDateInputMin}
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
            <div className="w-44">
              <SelectField label="Range" value={String(months)} onChange={(e) => setMonths(Number(e.target.value))}>
                <option value="6">Last 6 months</option>
                <option value="12">Last 12 months</option>
                <option value="24">Last 24 months</option>
              </SelectField>
            </div>
            <Button variant="ghost" size="sm" className="!w-9 !px-0" onClick={load} isLoading={loading} aria-label="Refresh">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4"
              >
                <path d="M21 12a9 9 0 1 1-2.64-6.36" />
                <polyline points="21 3 21 9 15 9" />
              </svg>
            </Button>
          </div>
        }
      />

      <Alert variant="error">{error}</Alert>

      {loading && !report ? (
        <div className="flex justify-center py-16">
          <Spinner size={24} className="text-gold-300" />
        </div>
      ) : report && totals ? (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatsWidget title="Total revenue" value={formatCurrency(totals.revenue)} />
            <StatsWidget title="Orders" value={totals.orders} />
            <StatsWidget title="Quotations" value={totals.quotations} />
            <StatsWidget
              title="Quote to order conversion"
              value={`${report.quotation_conversion.conversion_rate}%`}
              unit={`${report.quotation_conversion.converted_quotations} of ${report.quotation_conversion.total_quotations}`}
            />
          </div>

          <GlassCard className="mb-6 p-6">
            <h2 className="mb-1 font-display text-lg font-medium text-white">Revenue &amp; orders by month</h2>
            <p className="mb-4 text-xs text-white/40">Click a bar to see the orders behind that month.</p>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={report.monthly} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                  <XAxis dataKey="label" tick={AXIS_TICK} />
                  <YAxis
                    yAxisId="revenue"
                    tick={AXIS_TICK}
                    tickFormatter={(v: number) => formatCurrency(v)}
                    width={90}
                  />
                  <YAxis yAxisId="orders" orientation="right" tick={AXIS_TICK} allowDecimals={false} />
                  <Tooltip
                    cursor={TOOLTIP_CURSOR}
                    contentStyle={TOOLTIP_STYLE}
                    labelStyle={TOOLTIP_LABEL_STYLE}
                    formatter={(value: ValueType | undefined, name: NameType | undefined) =>
                      name === 'revenue' ? [formatCurrency(toNumber(value)), 'Revenue'] : [toNumber(value), 'Orders']
                    }
                  />
                  <Bar
                    yAxisId="revenue"
                    dataKey="revenue"
                    fill="#d4af6a"
                    radius={[4, 4, 0, 0]}
                    cursor="pointer"
                    onClick={onBarClick<SalesReportMonthly>((row) =>
                      setFilter({ year: row.year, month: row.month, label: row.label }),
                    )}
                  />
                  <Line
                    yAxisId="orders"
                    dataKey="order_count"
                    name="order_count"
                    stroke="#a78bfa"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </GlassCard>

          <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <GlassCard className="p-6">
              <h2 className="mb-1 font-display text-lg font-medium text-white">Orders by status</h2>
              <p className="mb-4 text-xs text-white/40">Click a bar to see those orders.</p>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart layout="vertical" data={report.by_status} margin={{ left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} horizontal={false} />
                    <XAxis type="number" tick={AXIS_TICK} allowDecimals={false} />
                    <YAxis
                      type="category"
                      dataKey="status"
                      tick={AXIS_TICK}
                      tickFormatter={(v: string) => v.replace(/_/g, ' ')}
                      width={110}
                    />
                    <Tooltip
                      cursor={TOOLTIP_CURSOR}
                      contentStyle={TOOLTIP_STYLE}
                      labelStyle={TOOLTIP_LABEL_STYLE}
                      formatter={(
                        value: ValueType | undefined,
                        _name: NameType | undefined,
                        item: { payload?: SalesReportStatus },
                      ) => [
                        `${toNumber(value)} orders · ${formatCurrency(item.payload?.revenue)}`,
                        (item.payload?.status ?? '').replace(/_/g, ' '),
                      ]}
                    />
                    <Bar
                      dataKey="count"
                      radius={[0, 4, 4, 0]}
                      cursor="pointer"
                      onClick={onBarClick<SalesReportStatus>((row) =>
                        setFilter({ status: row.status, label: row.status.replace(/_/g, ' ') }),
                      )}
                    >
                      {report.by_status.map((s) => (
                        <Cell key={s.status} fill={STATUS_COLORS[s.status] ?? '#9aa0ae'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </GlassCard>

            <GlassCard className="p-6">
              <h2 className="mb-1 font-display text-lg font-medium text-white">Top customers</h2>
              <p className="mb-4 text-xs text-white/40">Click a bar to see their orders.</p>
              {report.top_customers.length === 0 ? (
                <EmptyState title="No revenue yet" message="Nothing to show for this range." />
              ) : (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart layout="vertical" data={report.top_customers} margin={{ left: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} horizontal={false} />
                      <XAxis type="number" tick={AXIS_TICK} tickFormatter={(v: number) => formatCurrency(v)} />
                      <YAxis type="category" dataKey="customer_name" tick={AXIS_TICK} width={120} />
                      <Tooltip
                        cursor={TOOLTIP_CURSOR}
                        contentStyle={TOOLTIP_STYLE}
                        labelStyle={TOOLTIP_LABEL_STYLE}
                        formatter={(value: ValueType | undefined) => [formatCurrency(toNumber(value)), 'Revenue']}
                      />
                      <Bar
                        dataKey="revenue"
                        fill="#d4af6a"
                        radius={[0, 4, 4, 0]}
                        cursor="pointer"
                        onClick={onBarClick<SalesReportTopCustomer>((row) =>
                          setFilter({ customerId: row.customer_id, label: row.customer_name }),
                        )}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </GlassCard>
          </div>

          <GlassCard className="mb-6 p-6">
            <h2 className="mb-1 font-display text-lg font-medium text-white">Top products</h2>
            <p className="mb-4 text-xs text-white/40">Click a bar to see the orders that included it.</p>
            {report.top_products.length === 0 ? (
              <EmptyState title="No revenue yet" message="Nothing to show for this range." />
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart layout="vertical" data={report.top_products} margin={{ left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} horizontal={false} />
                    <XAxis type="number" tick={AXIS_TICK} tickFormatter={(v: number) => formatCurrency(v)} />
                    <YAxis type="category" dataKey="name" tick={AXIS_TICK} width={160} />
                    <Tooltip
                      cursor={TOOLTIP_CURSOR}
                      contentStyle={TOOLTIP_STYLE}
                      labelStyle={TOOLTIP_LABEL_STYLE}
                      formatter={(
                        value: ValueType | undefined,
                        _name: NameType | undefined,
                        item: { payload?: SalesReportTopProduct },
                      ) => [
                        `${formatCurrency(toNumber(value))} · ${item.payload?.quantity ?? 0} units`,
                        item.payload?.code ?? '',
                      ]}
                    />
                    <Bar
                      dataKey="revenue"
                      fill="#e4c37e"
                      radius={[0, 4, 4, 0]}
                      cursor="pointer"
                      onClick={onBarClick<SalesReportTopProduct>((row) =>
                        setFilter({ productId: row.product_id, label: `${row.code} — ${row.name}` }),
                      )}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </GlassCard>

          {filter && (
            <GlassCard className="overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-6 py-4">
                <div>
                  <h2 className="font-display text-lg font-medium text-white capitalize">Orders — {filter.label}</h2>
                  <p className="mt-1 text-xs text-white/40">Drilled down from the charts above.</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setFilter(null)}>
                  Clear filter
                </Button>
              </div>
              <Alert variant="error">{drilldownError}</Alert>
              {drilldownLoading ? (
                <div className="flex justify-center py-12">
                  <Spinner size={24} className="text-gold-300" />
                </div>
              ) : !drilldown || drilldown.length === 0 ? (
                <EmptyState title="No orders found" message="Nothing matches this drill-down." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-white/10 text-xs tracking-wide text-white/40 uppercase">
                        <th className="px-6 py-4 font-medium">Number</th>
                        <th className="px-6 py-4 font-medium">Customer</th>
                        <th className="px-6 py-4 font-medium">Date</th>
                        <th className="px-6 py-4 font-medium">Status</th>
                        <th className="px-6 py-4 font-medium">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {drilldown.map((o) => (
                        <tr key={o.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.03]">
                          <td className="px-6 py-4">
                            <Link to={`/orders/${o.id}`} className="font-medium text-gold-300 hover:text-gold-200">
                              {o.order_number}
                            </Link>
                          </td>
                          <td className="px-6 py-4 text-white">{o.customer_name ?? '—'}</td>
                          <td className="px-6 py-4 text-white/60">{formatDate(o.order_date)}</td>
                          <td className="px-6 py-4">
                            <StatusBadge status={o.status} />
                          </td>
                          <td className="px-6 py-4 text-white/60">{formatCurrency(o.total_amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </GlassCard>
          )}
        </>
      ) : null}
    </AppLayout>
  )
}
