import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AppLayout } from '@/components/layout/AppLayout'
import { StatsWidget } from '@/components/dashboard/DashboardWidgets'
import { Alert, Button, EmptyState, GlassCard, PageHeader, SelectField, Spinner, StatusBadge } from '@/components/ui'
import { getPurchasingDrilldown, getPurchasingReport } from '@/api/reports'
import type {
  PurchasingDrilldownOrder,
  PurchasingReport,
  PurchasingReportMonthly,
  PurchasingReportStatus,
  PurchasingReportTopMaterial,
  PurchasingReportTopSupplier,
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

// Mirrors components/ui/Badge.tsx's STATUS_TONES for purchase order statuses.
const STATUS_COLORS: Record<string, string> = {
  draft: '#9aa0ae',
  sent: '#a78bfa',
  confirmed: '#34d399',
  partially_received: '#d4af6a',
  received: '#34d399',
  cancelled: '#f87171',
}

interface DrilldownFilter {
  year?: number
  month?: number
  status?: string
  supplierId?: number
  materialId?: number
  label: string
}

export function PurchasingReportPage() {
  const [months, setMonths] = useState(12)
  const [report, setReport] = useState<PurchasingReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [filter, setFilter] = useState<DrilldownFilter | null>(null)
  const [drilldown, setDrilldown] = useState<PurchasingDrilldownOrder[] | null>(null)
  const [drilldownLoading, setDrilldownLoading] = useState(false)
  const [drilldownError, setDrilldownError] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    getPurchasingReport(months)
      .then(setReport)
      .catch((err) => setError(getApiErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [months])

  useEffect(load, [load])

  useEffect(() => {
    if (!filter) {
      setDrilldown(null)
      return
    }
    setDrilldownLoading(true)
    setDrilldownError(null)
    getPurchasingDrilldown({
      year: filter.year,
      month: filter.month,
      status: filter.status,
      supplier_id: filter.supplierId,
      raw_material_id: filter.materialId,
    })
      .then((res) => setDrilldown(res.items))
      .catch((err) => setDrilldownError(getApiErrorMessage(err)))
      .finally(() => setDrilldownLoading(false))
  }, [filter])

  const totals = useMemo(() => {
    if (!report) return null
    const t = report.monthly.reduce(
      (acc, m) => ({ spend: acc.spend + m.spend, pos: acc.pos + m.po_count }),
      { spend: 0, pos: 0 },
    )
    return { ...t, avg: t.pos > 0 ? t.spend / t.pos : 0 }
  }, [report])

  return (
    <AppLayout>
      <PageHeader
        title="Purchasing report"
        subtitle="Purchase order spend, supplier performance, and lead times. Click any chart to drill into the orders behind it."
        actions={
          <div className="flex items-end gap-3">
            <div className="w-44">
              <SelectField label="Range" value={String(months)} onChange={(e) => setMonths(Number(e.target.value))}>
                <option value="6">Last 6 months</option>
                <option value="12">Last 12 months</option>
                <option value="24">Last 24 months</option>
              </SelectField>
            </div>
            <Button variant="ghost" onClick={load} isLoading={loading}>
              Refresh
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
            <StatsWidget title="Total spend" value={formatCurrency(totals.spend)} />
            <StatsWidget title="Purchase orders" value={totals.pos} />
            <StatsWidget title="Avg PO value" value={formatCurrency(totals.avg)} />
            <StatsWidget
              title="Top supplier"
              value={report.top_suppliers[0]?.supplier_name ?? '—'}
              unit={report.top_suppliers[0] ? formatCurrency(report.top_suppliers[0].spend) : undefined}
            />
          </div>

          <GlassCard className="mb-6 p-6">
            <h2 className="mb-1 font-display text-lg font-medium text-white">Spend &amp; POs by month</h2>
            <p className="mb-4 text-xs text-white/40">Click a bar to see the purchase orders behind that month.</p>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={report.monthly} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                  <XAxis dataKey="label" tick={AXIS_TICK} />
                  <YAxis yAxisId="spend" tick={AXIS_TICK} tickFormatter={(v: number) => formatCurrency(v)} width={90} />
                  <YAxis yAxisId="pos" orientation="right" tick={AXIS_TICK} allowDecimals={false} />
                  <Tooltip
                    cursor={TOOLTIP_CURSOR}
                    contentStyle={TOOLTIP_STYLE}
                    labelStyle={TOOLTIP_LABEL_STYLE}
                    formatter={(value: ValueType | undefined, name: NameType | undefined) =>
                      name === 'spend' ? [formatCurrency(toNumber(value)), 'Spend'] : [toNumber(value), 'POs']
                    }
                  />
                  <Bar
                    yAxisId="spend"
                    dataKey="spend"
                    fill="#d4af6a"
                    radius={[4, 4, 0, 0]}
                    cursor="pointer"
                    onClick={onBarClick<PurchasingReportMonthly>((row) =>
                      setFilter({ year: row.year, month: row.month, label: row.label }),
                    )}
                  />
                  <Line yAxisId="pos" dataKey="po_count" name="po_count" stroke="#a78bfa" strokeWidth={2} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </GlassCard>

          <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <GlassCard className="p-6">
              <h2 className="mb-1 font-display text-lg font-medium text-white">Purchase orders by status</h2>
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
                        item: { payload?: PurchasingReportStatus },
                      ) => [
                        `${toNumber(value)} orders · ${formatCurrency(item.payload?.spend)}`,
                        (item.payload?.status ?? '').replace(/_/g, ' '),
                      ]}
                    />
                    <Bar
                      dataKey="count"
                      radius={[0, 4, 4, 0]}
                      cursor="pointer"
                      onClick={onBarClick<PurchasingReportStatus>((row) =>
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
              <h2 className="mb-1 font-display text-lg font-medium text-white">Top suppliers</h2>
              <p className="mb-4 text-xs text-white/40">Click a bar to see their orders.</p>
              {report.top_suppliers.length === 0 ? (
                <EmptyState title="No spend yet" message="Nothing to show for this range." />
              ) : (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart layout="vertical" data={report.top_suppliers} margin={{ left: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} horizontal={false} />
                      <XAxis type="number" tick={AXIS_TICK} tickFormatter={(v: number) => formatCurrency(v)} />
                      <YAxis type="category" dataKey="supplier_name" tick={AXIS_TICK} width={120} />
                      <Tooltip
                        cursor={TOOLTIP_CURSOR}
                        contentStyle={TOOLTIP_STYLE}
                        labelStyle={TOOLTIP_LABEL_STYLE}
                        formatter={(value: ValueType | undefined) => [formatCurrency(toNumber(value)), 'Spend']}
                      />
                      <Bar
                        dataKey="spend"
                        fill="#d4af6a"
                        radius={[0, 4, 4, 0]}
                        cursor="pointer"
                        onClick={onBarClick<PurchasingReportTopSupplier>((row) =>
                          setFilter({ supplierId: row.supplier_id, label: row.supplier_name }),
                        )}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </GlassCard>
          </div>

          <GlassCard className="mb-6 p-6">
            <h2 className="mb-1 font-display text-lg font-medium text-white">Top raw materials</h2>
            <p className="mb-4 text-xs text-white/40">Click a bar to see the orders that included it.</p>
            {report.top_materials.length === 0 ? (
              <EmptyState title="No spend yet" message="Nothing to show for this range." />
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart layout="vertical" data={report.top_materials} margin={{ left: 8 }}>
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
                        item: { payload?: PurchasingReportTopMaterial },
                      ) => [
                        `${formatCurrency(toNumber(value))} · ${item.payload?.quantity ?? 0} units`,
                        item.payload?.code ?? '',
                      ]}
                    />
                    <Bar
                      dataKey="spend"
                      fill="#e4c37e"
                      radius={[0, 4, 4, 0]}
                      cursor="pointer"
                      onClick={onBarClick<PurchasingReportTopMaterial>((row) =>
                        setFilter({ materialId: row.raw_material_id, label: `${row.code} — ${row.name}` }),
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
                  <h2 className="font-display text-lg font-medium text-white capitalize">
                    Purchase orders — {filter.label}
                  </h2>
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
                <EmptyState title="No purchase orders found" message="Nothing matches this drill-down." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-white/10 text-xs tracking-wide text-white/40 uppercase">
                        <th className="px-6 py-4 font-medium">Number</th>
                        <th className="px-6 py-4 font-medium">Supplier</th>
                        <th className="px-6 py-4 font-medium">Date</th>
                        <th className="px-6 py-4 font-medium">Status</th>
                        <th className="px-6 py-4 font-medium">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {drilldown.map((po) => (
                        <tr key={po.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.03]">
                          <td className="px-6 py-4">
                            <Link
                              to={`/purchase-orders/${po.id}`}
                              className="font-medium text-gold-300 hover:text-gold-200"
                            >
                              {po.po_number}
                            </Link>
                          </td>
                          <td className="px-6 py-4 text-white">{po.supplier_name ?? '—'}</td>
                          <td className="px-6 py-4 text-white/60">{formatDate(po.order_date)}</td>
                          <td className="px-6 py-4">
                            <StatusBadge status={po.status} />
                          </td>
                          <td className="px-6 py-4 text-white/60">{formatCurrency(po.total_amount)}</td>
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
