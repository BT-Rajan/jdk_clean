import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AppLayout } from '@/components/layout/AppLayout'
import { useClientPagination } from '@/hooks/useClientPagination'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import {
  Alert,
  Button,
  EmptyState,
  GlassCard,
  Pagination,
  SelectField,
  Spinner,
  StatusBadge,
  TextField,
} from '@/components/ui'
import { getSalesDrilldown, getSalesReport } from '@/api/reports'
import { todayDateInputMin } from '@/lib/validation/dateRules'
import type { SalesDrilldownOrder, SalesReport, SalesReportMonthly, SalesReportStatus } from '@/types/reports'
import { getApiErrorMessage } from '@/lib/apiError'
import { CURRENCY_CODE, formatCurrency } from '@/lib/currency'
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
import { customerRevenueRows, productRevenueRows } from './revenueRows'
import { RevenueBars } from './RevenueBars'
import { RevenueTrendChart } from './RevenueTrendChart'
import { buildAttention, buildFunnel, ORDER_PIPELINE } from './salesReportModel'
import { BarEndLabel, KpiTile, NoWrapYTick, Panel, SalesAttention, SalesFunnel } from './SalesReportPanels'
import { useSalesPipeline } from './useSalesPipeline'

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

function kwdNumber(value: number): string {
  return formatCurrency(value).replace(`${CURRENCY_CODE} `, '')
}

export function SalesReportPage() {
  const [months, setMonths] = useState(12)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [report, setReport] = useState<SalesReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Lists that feed the funnel's extra stages and the attention list. They
  // describe current state, so a date-range change doesn't refetch them --
  // only Refresh (and first load) does.
  const { pipeline, loading: pipelineLoading, reload: reloadPipeline } = useSalesPipeline({ withReadyToShip: true })

  const [filter, setFilter] = useState<DrilldownFilter | null>(null)
  const [drilldown, setDrilldown] = useState<SalesDrilldownOrder[] | null>(null)
  const [drilldownLoading, setDrilldownLoading] = useState(false)
  const [drilldownError, setDrilldownError] = useState<string | null>(null)
  const drilldownRef = useRef<HTMLDivElement>(null)

  const narrow = useMediaQuery('(max-width: 639px)')

  const reportRequest = useRef(0)
  const load = useCallback(() => {
    const id = ++reportRequest.current
    setLoading(true)
    setError(null)
    getSalesReport({ months, dateFrom, dateTo })
      .then((res) => {
        if (id === reportRequest.current) setReport(res)
      })
      .catch((err) => {
        if (id === reportRequest.current) setError(getApiErrorMessage(err))
      })
      .finally(() => {
        if (id === reportRequest.current) setLoading(false)
      })
  }, [months, dateFrom, dateTo])

  const refresh = useCallback(() => {
    load()
    reloadPipeline()
  }, [load, reloadPipeline])

  useEffect(load, [load])

  useEffect(() => {
    if (!filter) {
      setDrilldown(null)
      return
    }
    let cancelled = false
    setDrilldownLoading(true)
    setDrilldownError(null)
    getSalesDrilldown({
      year: filter.year,
      month: filter.month,
      status: filter.status,
      customer_id: filter.customerId,
      product_id: filter.productId,
    })
      .then((res) => {
        if (!cancelled) setDrilldown(res.items)
      })
      .catch((err) => {
        if (!cancelled) setDrilldownError(getApiErrorMessage(err))
      })
      .finally(() => {
        if (!cancelled) setDrilldownLoading(false)
      })
    // The drill-down table sits below the charts -- bring it into view so a
    // click visibly does something on a compact page.
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    drilldownRef.current?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
    return () => {
      cancelled = true
    }
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

  const funnel = useMemo(() => (report ? buildFunnel(report, pipeline) : null), [report, pipeline])
  const attention = useMemo(() => buildAttention(pipeline, todayDateInputMin), [pipeline])

  const pipelineRows = useMemo(() => {
    if (!report) return []
    const byStatus = new Map(report.by_status.map((s) => [s.status, s]))
    return ORDER_PIPELINE.map(({ status, label }) => ({
      status,
      label,
      count: byStatus.get(status)?.count ?? 0,
      revenue: byStatus.get(status)?.revenue ?? 0,
    }))
  }, [report])

  const customerRows = useMemo(() => customerRevenueRows(report?.top_customers), [report])
  const productRows = useMemo(() => productRevenueRows(report?.top_products), [report])

  const drilldownPager = useClientPagination(drilldown, { resetKey: filter })

  const selectMonth = (row: SalesReportMonthly) => setFilter({ year: row.year, month: row.month, label: row.label })

  return (
    <AppLayout>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <h1 className="font-display text-3xl font-medium text-white">Sales report</h1>
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
          <Button variant="ghost" size="sm" className="!w-9 !px-0" onClick={refresh} isLoading={loading} aria-label="Refresh">
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
      </div>

      <Alert variant="error">{error}</Alert>

      {loading && !report ? (
        <div className="flex justify-center py-16">
          <Spinner size={24} className="text-gold-300" />
        </div>
      ) : report && totals && funnel ? (
        <div className="flex min-w-0 flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiTile
              label="Revenue"
              value={kwdNumber(totals.revenue)}
              unit={CURRENCY_CODE}
              note="Excludes draft and cancelled orders"
            />
            <KpiTile label="Orders" value={totals.orders} note="Placed in this range" />
            <KpiTile label="Quotations" value={totals.quotations} note="Raised in this range" />
            <KpiTile
              label="Quote to order"
              value={`${report.quotation_conversion.conversion_rate}%`}
              note={`${report.quotation_conversion.converted_quotations} of ${report.quotation_conversion.total_quotations} quotations converted`}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
            <Panel title="Revenue trend" hint={`${CURRENCY_CODE} per month · click a month to see its orders`}>
              <div className="h-56 w-full sm:h-64">
                <RevenueTrendChart months={report.monthly} onSelectMonth={selectMonth} />
              </div>
            </Panel>

            <Panel title="Sales funnel" hint="Share of each stage that moved on, for this range">
              {pipelineLoading ? (
                <div className="flex justify-center py-10">
                  <Spinner size={20} className="text-gold-300" />
                </div>
              ) : (
                <SalesFunnel stages={funnel} />
              )}
            </Panel>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Order pipeline" hint="Orders by status · click a bar to see those orders">
              <div className="h-[15.5rem] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart layout="vertical" data={pipelineRows} margin={{ top: 0, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} horizontal={false} />
                    <XAxis
                      type="number"
                      tick={AXIS_TICK}
                      allowDecimals={false}
                      domain={[0, (max: number) => Math.max(4, Math.ceil(max / 4) * 4)]}
                    />
                    <YAxis
                      type="category"
                      dataKey="label"
                      width={narrow ? 92 : 104}
                      interval={0}
                      tick={<NoWrapYTick />}
                    />
                    <Tooltip
                      cursor={TOOLTIP_CURSOR}
                      contentStyle={TOOLTIP_STYLE}
                      labelStyle={TOOLTIP_LABEL_STYLE}
                      formatter={(
                        value: ValueType | undefined,
                        _name: NameType | undefined,
                        item: { payload?: SalesReportStatus },
                      ) => [`${toNumber(value)} orders · ${formatCurrency(item.payload?.revenue)}`, 'Orders']}
                    />
                    <Bar
                      dataKey="count"
                      barSize={14}
                      minPointSize={2}
                      radius={[0, 4, 4, 0]}
                      cursor="pointer"
                      onClick={onBarClick<{ status: string; label: string }>((row) =>
                        setFilter({ status: row.status, label: row.label }),
                      )}
                    >
                      {pipelineRows.map((s) => (
                        <Cell key={s.status} fill={STATUS_COLORS[s.status] ?? '#9aa0ae'} />
                      ))}
                      <LabelList dataKey="count" content={<BarEndLabel />} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>

            <Panel title="Sales attention" hint="What needs a decision or a next step now">
              <SalesAttention
                result={attention}
                loading={pipelineLoading}
                onDrilldown={(status, label) => setFilter({ status, label })}
              />
            </Panel>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Top customers" hint={`Revenue in ${CURRENCY_CODE} · click a bar to see their orders`}>
              {customerRows.length === 0 ? (
                <EmptyState title="No revenue yet" message="Nothing to show for this range." />
              ) : (
                <RevenueBars
                  rows={customerRows}
                  height={Math.max(customerRows.length * 30 + 30, 120)}
                  onSelect={(c) => setFilter({ customerId: c.customer_id, label: c.customer_name })}
                />
              )}
            </Panel>

            <Panel title="Top products" hint={`Revenue in ${CURRENCY_CODE} · click a bar to see orders that included it`}>
              {productRows.length === 0 ? (
                <EmptyState title="No revenue yet" message="Nothing to show for this range." />
              ) : (
                <RevenueBars
                  rows={productRows}
                  height={Math.max(productRows.length * 30 + 30, 120)}
                  onSelect={(p) => setFilter({ productId: p.product_id, label: `${p.code} — ${p.name}` })}
                />
              )}
            </Panel>
          </div>

          {filter && (
            <GlassCard ref={drilldownRef} className="scroll-mt-24 overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-3.5">
                <div>
                  <h2 className="font-display text-base font-medium text-white capitalize">Orders — {filter.label}</h2>
                  <p className="mt-0.5 text-xs text-white/40">Drilled down from the charts above.</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setFilter(null)}>
                  Clear filter
                </Button>
              </div>
              <Alert variant="error">{drilldownError}</Alert>
              {drilldownLoading ? (
                <div className="flex justify-center py-10">
                  <Spinner size={24} className="text-gold-300" />
                </div>
              ) : !drilldown || drilldown.length === 0 ? (
                <EmptyState title="No orders found" message="Nothing matches this drill-down." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-white/10 text-xs tracking-wide text-white/40 uppercase">
                        <th className="px-5 py-3 font-medium">Number</th>
                        <th className="px-5 py-3 font-medium">Customer</th>
                        <th className="px-5 py-3 font-medium">Date</th>
                        <th className="px-5 py-3 font-medium">Status</th>
                        <th className="px-5 py-3 font-medium">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {drilldownPager.pageItems.map((o) => (
                        <tr key={o.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.03]">
                          <td className="px-5 py-3">
                            <Link to={`/orders/${o.id}`} className="font-medium text-gold-300 hover:text-gold-200">
                              {o.order_number}
                            </Link>
                          </td>
                          <td className="px-5 py-3 text-white">{o.customer_name ?? '—'}</td>
                          <td className="px-5 py-3 whitespace-nowrap text-white/60">{formatDate(o.order_date)}</td>
                          <td className="px-5 py-3">
                            <StatusBadge status={o.status} />
                          </td>
                          <td className="px-5 py-3 whitespace-nowrap text-white/60">{formatCurrency(o.total_amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <Pagination className="px-5 pb-4" {...drilldownPager.pagerProps} />
            </GlassCard>
          )}
        </div>
      ) : null}
    </AppLayout>
  )
}
