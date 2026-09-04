import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
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
import { getProductionDrilldown, getProductionReport } from '@/api/reports'
import { todayDateInputMin } from '@/lib/validation/dateRules'
import type {
  ProductionDrilldownBatch,
  ProductionReport,
  ProductionReportMonthly,
  ProductionReportStatus,
  ProductionReportTopProduct,
} from '@/types/reports'
import { getApiErrorMessage } from '@/lib/apiError'
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

// Mirrors components/ui/Badge.tsx's STATUS_TONES for production batch statuses.
const STATUS_COLORS: Record<string, string> = {
  planned: '#9aa0ae',
  in_progress: '#d4af6a',
  completed: '#34d399',
  cancelled: '#f87171',
}

interface DrilldownFilter {
  year?: number
  month?: number
  status?: string
  productId?: number
  label: string
}

export function ProductionReportPage() {
  const [months, setMonths] = useState(12)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [report, setReport] = useState<ProductionReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [filter, setFilter] = useState<DrilldownFilter | null>(null)
  const [drilldown, setDrilldown] = useState<ProductionDrilldownBatch[] | null>(null)
  const [drilldownLoading, setDrilldownLoading] = useState(false)
  const [drilldownError, setDrilldownError] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    getProductionReport({ months, dateFrom, dateTo })
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
    getProductionDrilldown({
      year: filter.year,
      month: filter.month,
      status: filter.status,
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
        batches: acc.batches + m.batch_count,
        planned: acc.planned + m.planned_quantity,
        produced: acc.produced + m.produced_quantity,
      }),
      { batches: 0, planned: 0, produced: 0 },
    )
  }, [report])

  return (
    <AppLayout>
      <PageHeader
        title="Production report"
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
            <StatsWidget title="Batches" value={totals.batches} />
            <StatsWidget title="Planned quantity" value={totals.planned.toLocaleString()} />
            <StatsWidget title="Produced quantity" value={totals.produced.toLocaleString()} />
            <StatsWidget
              title="Material discrepancies"
              value={report.material_discrepancy_count}
              unit={report.material_discrepancy_count > 0 ? 'flagged' : undefined}
            />
          </div>

          <GlassCard className="mb-6 p-6">
            <h2 className="mb-1 font-display text-lg font-medium text-white">Batches &amp; quantity by month</h2>
            <p className="mb-4 text-xs text-white/40">Click a bar to see the batches behind that month.</p>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={report.monthly} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                  <XAxis dataKey="label" tick={AXIS_TICK} />
                  <YAxis yAxisId="quantity" tick={AXIS_TICK} width={70} />
                  <YAxis yAxisId="batches" orientation="right" tick={AXIS_TICK} allowDecimals={false} />
                  <Tooltip
                    cursor={TOOLTIP_CURSOR}
                    contentStyle={TOOLTIP_STYLE}
                    labelStyle={TOOLTIP_LABEL_STYLE}
                    formatter={(value: ValueType | undefined, name: NameType | undefined) =>
                      name === 'produced_quantity'
                        ? [toNumber(value), 'Produced']
                        : [toNumber(value), 'Batches']
                    }
                  />
                  <Bar
                    yAxisId="quantity"
                    dataKey="produced_quantity"
                    fill="#d4af6a"
                    radius={[4, 4, 0, 0]}
                    cursor="pointer"
                    onClick={onBarClick<ProductionReportMonthly>((row) =>
                      setFilter({ year: row.year, month: row.month, label: row.label }),
                    )}
                  />
                  <Line
                    yAxisId="batches"
                    dataKey="batch_count"
                    name="batch_count"
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
              <h2 className="mb-1 font-display text-lg font-medium text-white">Batches by status</h2>
              <p className="mb-4 text-xs text-white/40">Click a bar to see those batches.</p>
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
                        item: { payload?: ProductionReportStatus },
                      ) => [
                        `${toNumber(value)} batches · ${item.payload?.planned_quantity ?? 0} planned`,
                        (item.payload?.status ?? '').replace(/_/g, ' '),
                      ]}
                    />
                    <Bar
                      dataKey="count"
                      radius={[0, 4, 4, 0]}
                      cursor="pointer"
                      onClick={onBarClick<ProductionReportStatus>((row) =>
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
              <h2 className="mb-1 font-display text-lg font-medium text-white">Top products</h2>
              <p className="mb-4 text-xs text-white/40">Click a bar to see the batches that produced it.</p>
              {report.top_products.length === 0 ? (
                <EmptyState title="No production yet" message="Nothing to show for this range." />
              ) : (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart layout="vertical" data={report.top_products} margin={{ left: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} horizontal={false} />
                      <XAxis type="number" tick={AXIS_TICK} />
                      <YAxis type="category" dataKey="name" tick={AXIS_TICK} width={140} />
                      <Tooltip
                        cursor={TOOLTIP_CURSOR}
                        contentStyle={TOOLTIP_STYLE}
                        labelStyle={TOOLTIP_LABEL_STYLE}
                        formatter={(
                          value: ValueType | undefined,
                          _name: NameType | undefined,
                          item: { payload?: ProductionReportTopProduct },
                        ) => [`${toNumber(value)} units · ${item.payload?.batch_count ?? 0} batches`, item.payload?.code ?? '']}
                      />
                      <Bar
                        dataKey="produced_quantity"
                        fill="#e4c37e"
                        radius={[0, 4, 4, 0]}
                        cursor="pointer"
                        onClick={onBarClick<ProductionReportTopProduct>((row) =>
                          setFilter({ productId: row.product_id, label: `${row.code} — ${row.name}` }),
                        )}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </GlassCard>
          </div>

          {filter && (
            <GlassCard className="overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-6 py-4">
                <div>
                  <h2 className="font-display text-lg font-medium text-white capitalize">Batches — {filter.label}</h2>
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
                <EmptyState title="No batches found" message="Nothing matches this drill-down." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-white/10 text-xs tracking-wide text-white/40 uppercase">
                        <th className="px-6 py-4 font-medium">Batch</th>
                        <th className="px-6 py-4 font-medium">Product</th>
                        <th className="px-6 py-4 font-medium">Scheduled start</th>
                        <th className="px-6 py-4 font-medium">Status</th>
                        <th className="px-6 py-4 font-medium">Quantity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {drilldown.map((b) => (
                        <tr key={b.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.03]">
                          <td className="px-6 py-4">
                            <Link to={`/production/${b.id}`} className="font-medium text-gold-300 hover:text-gold-200">
                              {b.batch_number}
                            </Link>
                          </td>
                          <td className="px-6 py-4 text-white">{b.product_name ?? '—'}</td>
                          <td className="px-6 py-4 text-white/60">{formatDate(b.scheduled_start)}</td>
                          <td className="px-6 py-4">
                            <StatusBadge status={b.status} />
                          </td>
                          <td className="px-6 py-4 text-white/60">
                            {b.status === 'completed' ? b.produced_quantity : b.planned_quantity}
                          </td>
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
