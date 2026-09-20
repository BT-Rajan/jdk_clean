import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Alert, StatusBadge } from '@/components/ui'
import { ChartCard, DrilldownPanel } from '@/components/dashboard/DashboardCharts'
import type { DrilldownColumn } from '@/components/dashboard/DashboardCharts'
import { getPurchasingDrilldown, getPurchasingReport } from '@/api/reports'
import type {
  PurchasingDrilldownOrder,
  PurchasingReport,
  PurchasingReportMonthly,
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
} from '@/pages/reports/chartHelpers'
import type { NameType, ValueType } from '@/pages/reports/chartHelpers'

const REPORT_MONTHS = 6

interface DrilldownFilter {
  label: string
  year?: number
  month?: number
  supplierId?: number
}

const PO_COLUMNS: DrilldownColumn<PurchasingDrilldownOrder>[] = [
  {
    header: 'Purchase order',
    cell: (po) => (
      <Link to={`/purchase-orders/${po.id}`} className="font-medium text-gold-300 hover:text-gold-200">
        {po.po_number}
      </Link>
    ),
  },
  { header: 'Supplier', cell: (po) => <span className="text-white">{po.supplier_name ?? '—'}</span> },
  { header: 'Date', cell: (po) => <span className="text-white/60">{formatDate(po.order_date)}</span> },
  { header: 'Status', cell: (po) => <StatusBadge status={po.status} /> },
  { header: 'Total', cell: (po) => <span className="text-white/60">{formatCurrency(po.total_amount)}</span> },
]

/**
 * The two graphs on the Purchasing dashboard -- spend & purchase orders by
 * month, and top suppliers by spend. Clicking a bar opens the purchase
 * orders behind it right below the graphs (same
 * /api/reports/purchasing/drilldown the Purchasing report uses).
 */
export function PurchasingDashboardCharts() {
  const [report, setReport] = useState<PurchasingReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [filter, setFilter] = useState<DrilldownFilter | null>(null)
  const [orders, setOrders] = useState<PurchasingDrilldownOrder[] | null>(null)
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [ordersError, setOrdersError] = useState<string | null>(null)
  const requestId = useRef(0)

  useEffect(() => {
    getPurchasingReport({ months: REPORT_MONTHS })
      .then(setReport)
      .catch((err) => setError(getApiErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [])

  function openDrilldown(next: DrilldownFilter) {
    const thisRequest = ++requestId.current
    setFilter(next)
    setOrders(null)
    setOrdersError(null)
    setOrdersLoading(true)
    getPurchasingDrilldown({ year: next.year, month: next.month, supplier_id: next.supplierId })
      .then((res) => {
        if (thisRequest === requestId.current) setOrders(res.items)
      })
      .catch((err) => {
        if (thisRequest === requestId.current) setOrdersError(getApiErrorMessage(err))
      })
      .finally(() => {
        if (thisRequest === requestId.current) setOrdersLoading(false)
      })
  }

  function clearDrilldown() {
    requestId.current++
    setFilter(null)
    setOrders(null)
  }

  const monthly = report?.monthly ?? []
  const topSuppliers = report?.top_suppliers ?? []

  return (
    <div className="mb-8 flex flex-col gap-6">
      <Alert variant="error">{error}</Alert>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard
          title="Spend & purchase orders by month"
          hint={`Last ${REPORT_MONTHS} months — click a bar to see that month's purchase orders.`}
          loading={loading}
          isEmpty={monthly.length === 0}
          emptyTitle="No purchasing yet"
          emptyMessage="Spend will appear here once purchase orders are raised."
        >
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={monthly} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
              <XAxis dataKey="label" tick={AXIS_TICK} />
              <YAxis yAxisId="spend" tick={AXIS_TICK} tickFormatter={(v: number) => formatCurrency(v)} width={90} />
              <YAxis yAxisId="pos" orientation="right" tick={AXIS_TICK} allowDecimals={false} />
              <Tooltip
                cursor={TOOLTIP_CURSOR}
                contentStyle={TOOLTIP_STYLE}
                labelStyle={TOOLTIP_LABEL_STYLE}
                formatter={(value: ValueType | undefined, name: NameType | undefined) =>
                  name === 'spend' ? [formatCurrency(toNumber(value)), 'Spend'] : [toNumber(value), 'Purchase orders']
                }
              />
              <Bar
                yAxisId="spend"
                dataKey="spend"
                fill="#d4af6a"
                radius={[4, 4, 0, 0]}
                cursor="pointer"
                onClick={onBarClick<PurchasingReportMonthly>((row) =>
                  openDrilldown({ year: row.year, month: row.month, label: `Purchase orders — ${row.label}` }),
                )}
              />
              <Line yAxisId="pos" dataKey="po_count" name="po_count" stroke="#a78bfa" strokeWidth={2} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Top suppliers by spend"
          hint="Click a bar to see that supplier's purchase orders."
          loading={loading}
          isEmpty={topSuppliers.length === 0}
          emptyTitle="No spend yet"
          emptyMessage="Suppliers will be ranked here once purchase orders are raised."
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart layout="vertical" data={topSuppliers} margin={{ left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} horizontal={false} />
              <XAxis type="number" tick={AXIS_TICK} tickFormatter={(v: number) => formatCurrency(v)} />
              <YAxis type="category" dataKey="supplier_name" tick={AXIS_TICK} width={120} />
              <Tooltip
                cursor={TOOLTIP_CURSOR}
                contentStyle={TOOLTIP_STYLE}
                labelStyle={TOOLTIP_LABEL_STYLE}
                formatter={(value: ValueType | undefined, _name: NameType | undefined, item: { payload?: PurchasingReportTopSupplier }) => [
                  `${formatCurrency(toNumber(value))} · ${item.payload?.po_count ?? 0} purchase orders`,
                  'Spend',
                ]}
              />
              <Bar
                dataKey="spend"
                fill="#d4af6a"
                radius={[0, 4, 4, 0]}
                cursor="pointer"
                onClick={onBarClick<PurchasingReportTopSupplier>((row) =>
                  openDrilldown({ supplierId: row.supplier_id, label: `Purchase orders — ${row.supplier_name}` }),
                )}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {filter && (
        <DrilldownPanel
          title={filter.label}
          subtitle="Drilled down from the graphs above."
          items={orders}
          loading={ordersLoading}
          error={ordersError}
          columns={PO_COLUMNS}
          rowKey={(po) => po.id}
          emptyTitle="No purchase orders found"
          emptyMessage="Nothing matches this selection."
          onClear={clearDrilldown}
        />
      )}
    </div>
  )
}
