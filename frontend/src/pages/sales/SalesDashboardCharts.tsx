import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Alert, StatusBadge } from '@/components/ui'
import { ChartCard, DrilldownPanel } from '@/components/dashboard/DashboardCharts'
import type { DrilldownColumn } from '@/components/dashboard/DashboardCharts'
import { getSalesDrilldown, getSalesReport } from '@/api/reports'
import type { SalesDrilldownOrder, SalesReport, SalesReportMonthly, SalesReportStatus } from '@/types/reports'
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

// Same colors as the Sales report's status bars, which mirror the
// StatusBadge tones, so a bar matches its badge everywhere.
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
  label: string
  year?: number
  month?: number
  status?: string
}

const ORDER_COLUMNS: DrilldownColumn<SalesDrilldownOrder>[] = [
  {
    header: 'Order',
    cell: (o) => (
      <Link to={`/orders/${o.id}`} className="font-medium text-gold-300 hover:text-gold-200">
        {o.order_number}
      </Link>
    ),
  },
  { header: 'Customer', cell: (o) => <span className="text-white">{o.customer_name ?? '—'}</span> },
  { header: 'Date', cell: (o) => <span className="text-white/60">{formatDate(o.order_date)}</span> },
  { header: 'Status', cell: (o) => <StatusBadge status={o.status} /> },
  { header: 'Total', cell: (o) => <span className="text-white/60">{formatCurrency(o.total_amount)}</span> },
]

/**
 * The two graphs on the Sales dashboard -- revenue & orders by month, and
 * orders by status. Clicking a bar opens the orders behind it right below
 * the graphs (same /api/reports/sales/drilldown the Sales report uses).
 */
export function SalesDashboardCharts() {
  const [report, setReport] = useState<SalesReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [filter, setFilter] = useState<DrilldownFilter | null>(null)
  const [orders, setOrders] = useState<SalesDrilldownOrder[] | null>(null)
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [ordersError, setOrdersError] = useState<string | null>(null)
  const requestId = useRef(0)

  useEffect(() => {
    getSalesReport({ months: REPORT_MONTHS })
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
    getSalesDrilldown({ year: next.year, month: next.month, status: next.status })
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
  const byStatus = report?.by_status ?? []

  return (
    <div className="mb-8 flex flex-col gap-6">
      <Alert variant="error">{error}</Alert>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard
          title="Revenue & orders by month"
          hint={`Last ${REPORT_MONTHS} months — click a bar to see that month's orders.`}
          loading={loading}
          isEmpty={monthly.length === 0}
          emptyTitle="No sales yet"
          emptyMessage="Revenue will appear here once orders come in."
        >
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={monthly} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
              <XAxis dataKey="label" tick={AXIS_TICK} />
              <YAxis yAxisId="revenue" tick={AXIS_TICK} tickFormatter={(v: number) => formatCurrency(v)} width={90} />
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
                  openDrilldown({ year: row.year, month: row.month, label: `Orders — ${row.label}` }),
                )}
              />
              <Line yAxisId="orders" dataKey="order_count" name="order_count" stroke="#a78bfa" strokeWidth={2} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Orders by status"
          hint="Click a bar to see those orders."
          loading={loading}
          isEmpty={byStatus.length === 0}
          emptyTitle="No orders yet"
          emptyMessage="Orders will be grouped by status here."
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart layout="vertical" data={byStatus} margin={{ left: 8 }}>
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
                formatter={(value: ValueType | undefined, _name: NameType | undefined, item: { payload?: SalesReportStatus }) => [
                  `${toNumber(value)} orders · ${formatCurrency(item.payload?.revenue)}`,
                  (item.payload?.status ?? '').replace(/_/g, ' '),
                ]}
              />
              <Bar
                dataKey="count"
                radius={[0, 4, 4, 0]}
                cursor="pointer"
                onClick={onBarClick<SalesReportStatus>((row) =>
                  openDrilldown({ status: row.status, label: `${row.status.replace(/_/g, ' ')} orders` }),
                )}
              >
                {byStatus.map((s) => (
                  <Cell key={s.status} fill={STATUS_COLORS[s.status] ?? '#9aa0ae'} />
                ))}
              </Bar>
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
          columns={ORDER_COLUMNS}
          rowKey={(o) => o.id}
          emptyTitle="No orders found"
          emptyMessage="Nothing matches this selection."
          onClear={clearDrilldown}
        />
      )}
    </div>
  )
}
