import { useEffect, useMemo, useRef, useState } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'
import { Alert, Spinner } from '@/components/ui'
import { getSalesReport } from '@/api/reports'
import { getApiErrorMessage } from '@/lib/apiError'
import { CURRENCY_CODE, formatCurrency } from '@/lib/currency'
import type { SalesReport, SalesReportMonthly, SalesReportTopCustomer, SalesReportTopProduct } from '@/types/reports'
import { customerRevenueRows, productRevenueRows } from '@/pages/reports/revenueRows'
import { RevenueBars } from '@/pages/reports/RevenueBars'
import { RevenueTrendChart } from '@/pages/reports/RevenueTrendChart'
import { buildFunnel, buildFunnelRecords } from '@/pages/reports/salesReportModel'
import { Panel, SalesFunnel } from '@/pages/reports/SalesReportPanels'
import { useSalesPipeline } from '@/pages/reports/useSalesPipeline'
import { FunnelDrilldown } from './FunnelDrilldown'
import { OrdersDrilldown } from './OrdersDrilldown'

const DASHBOARD_MONTHS = 12
const RANGE_HINT = `Last ${DASHBOARD_MONTHS} months`

/** The one drill-down that is open under the dashboard, if any. */
type Drill =
  | { kind: 'stage'; key: string }
  | { kind: 'month'; year: number; month: number }
  | { kind: 'customer'; id: number }
  | { kind: 'product'; id: number }

/**
 * The Sales dashboard: the same funnel, revenue trend, top customers and
 * top products the Sales report shows (same API, same charts), laid out as
 * two rows that fill the screen. Clicking a funnel stage, a month on the
 * revenue trend, a top customer or a top product opens the records behind it
 * in a panel under the rows (one at a time); the order-status drill-down
 * lives on the Sales report.
 */
export function SalesHomePage() {
  const [report, setReport] = useState<SalesReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { pipeline, loading: pipelineLoading } = useSalesPipeline({ withReadyToShip: false })
  const [drill, setDrill] = useState<Drill | null>(null)
  const drilldownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    getSalesReport({ months: DASHBOARD_MONTHS })
      .then((res) => {
        if (!cancelled) setReport(res)
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

  const funnel = useMemo(() => (report ? buildFunnel(report, pipeline) : null), [report, pipeline])
  const activeStage = drill?.kind === 'stage' ? (funnel?.find((s) => s.key === drill.key) ?? null) : null
  const activeMonth =
    drill?.kind === 'month' ? (report?.monthly.find((m) => m.year === drill.year && m.month === drill.month) ?? null) : null
  const activeCustomer =
    drill?.kind === 'customer' ? (report?.top_customers.find((c) => c.customer_id === drill.id) ?? null) : null
  const activeProduct =
    drill?.kind === 'product' ? (report?.top_products.find((p) => p.product_id === drill.id) ?? null) : null

  // One drill-down open at a time; picking the open one again closes it.
  const toggle = (next: Drill) =>
    setDrill((cur) => {
      if (!cur || cur.kind !== next.kind) return next
      const same =
        (cur.kind === 'stage' && next.kind === 'stage' && cur.key === next.key) ||
        (cur.kind === 'month' && next.kind === 'month' && cur.year === next.year && cur.month === next.month) ||
        (cur.kind === 'customer' && next.kind === 'customer' && cur.id === next.id) ||
        (cur.kind === 'product' && next.kind === 'product' && cur.id === next.id)
      return same ? null : next
    })
  const toggleMonth = (row: SalesReportMonthly) => toggle({ kind: 'month', year: row.year, month: row.month })
  const toggleCustomer = (row: SalesReportTopCustomer) => toggle({ kind: 'customer', id: row.customer_id })
  const toggleProduct = (row: SalesReportTopProduct) => toggle({ kind: 'product', id: row.product_id })

  const stageRecords = useMemo(
    () => (report && activeStage ? buildFunnelRecords(activeStage.key, report, pipeline) : null),
    [report, pipeline, activeStage],
  )
  // The same window the report (and so each bar) was drawn from.
  const rangeParams = report
    ? { date_from: report.range_start.slice(0, 10), date_to: report.range_end.slice(0, 10), revenue_only: true }
    : {}

  // The panel opens below the fold on a compact screen -- bring it into view
  // so a click visibly does something.
  const drillId = drill ? JSON.stringify(drill) : null
  useEffect(() => {
    if (!drillId) return
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    drilldownRef.current?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
  }, [drillId])

  const customerRows = useMemo(() => customerRevenueRows(report?.top_customers), [report])
  const productRows = useMemo(() => productRevenueRows(report?.top_products), [report])

  return (
    <AppLayout>
      <h1 className="mb-4 font-display text-3xl font-medium text-white">Sales</h1>

      <Alert variant="error">{error}</Alert>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner size={24} className="text-gold-300" />
        </div>
      ) : report && funnel ? (
        <>
          {/*
             On large screens the two rows split the remaining viewport height
             (never shorter than the funnel needs); below that everything stacks
             and each panel takes its own natural height.
          */}
          <div className="flex min-w-0 flex-col gap-4 lg:h-[calc(100dvh-18.8rem)] lg:min-h-[38.5rem]">
            <div className="grid gap-4 lg:min-h-[21.5rem] lg:flex-[1.1_1_0%] lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
              <Panel
                title="Revenue trend"
                hint={`${CURRENCY_CODE} per month · ${RANGE_HINT.toLowerCase()} · click a month for its orders`}
                bodyClassName="relative min-h-[15rem]"
              >
                <div className="absolute inset-0">
                  <RevenueTrendChart months={report.monthly} onSelectMonth={toggleMonth} selected={activeMonth} />
                </div>
              </Panel>

              <Panel
                title="Sales funnel"
                hint={`${RANGE_HINT} · share of each stage that moved on · click a stage for its records`}
                bodyClassName="flex min-h-[15.5rem] flex-col"
              >
                {pipelineLoading ? (
                  <div className="flex flex-1 items-center justify-center">
                    <Spinner size={20} className="text-gold-300" />
                  </div>
                ) : (
                  <div className="min-h-0 flex-1">
                    <SalesFunnel
                      stages={funnel}
                      fill
                      activeKey={activeStage?.key ?? null}
                      onSelectStage={(key) => toggle({ kind: 'stage', key })}
                    />
                  </div>
                )}
              </Panel>
            </div>

            <div className="grid gap-4 lg:min-h-[16rem] lg:flex-1 lg:basis-0 lg:grid-cols-2">
              <Panel
                title="Top customers"
                hint={`Revenue in ${CURRENCY_CODE} · ${RANGE_HINT.toLowerCase()} · click a customer for their orders`}
                bodyClassName="relative min-h-[18rem] lg:min-h-0"
              >
                <div className="absolute inset-0">
                  {customerRows.length === 0 ? (
                    <p className="py-6 text-center text-sm text-white/50">No revenue in this period.</p>
                  ) : (
                    <RevenueBars
                      rows={customerRows}
                      onSelect={toggleCustomer}
                      selected={(c) => c.customer_id === activeCustomer?.customer_id}
                    />
                  )}
                </div>
              </Panel>

              <Panel
                title="Top products"
                hint={`Revenue in ${CURRENCY_CODE} · ${RANGE_HINT.toLowerCase()} · click a product for its orders`}
                bodyClassName="relative min-h-[18rem] lg:min-h-0"
              >
                <div className="absolute inset-0">
                  {productRows.length === 0 ? (
                    <p className="py-6 text-center text-sm text-white/50">No revenue in this period.</p>
                  ) : (
                    <RevenueBars
                      rows={productRows}
                      onSelect={toggleProduct}
                      selected={(p) => p.product_id === activeProduct?.product_id}
                    />
                  )}
                </div>
              </Panel>
            </div>
          </div>
          {activeStage && (
            <div className="mt-4">
              <FunnelDrilldown
                ref={drilldownRef}
                stage={activeStage}
                data={stageRecords}
                rangeHint={RANGE_HINT}
                onClose={() => setDrill(null)}
              />
            </div>
          )}
          {activeMonth && (
            <div className="mt-4">
              <OrdersDrilldown
                ref={drilldownRef}
                title={`Orders — ${activeMonth.label}`}
                summary={`${activeMonth.order_count} ${activeMonth.order_count === 1 ? 'order' : 'orders'} · ${formatCurrency(activeMonth.revenue)} revenue · drilled down from the revenue trend above`}
                params={{ year: activeMonth.year, month: activeMonth.month }}
                expectedCount={activeMonth.order_count}
                markNonRevenue
                onClose={() => setDrill(null)}
              />
            </div>
          )}
          {activeCustomer && (
            <div className="mt-4">
              <OrdersDrilldown
                ref={drilldownRef}
                title={`Orders — ${activeCustomer.customer_name}`}
                summary={`${activeCustomer.order_count} ${activeCustomer.order_count === 1 ? 'order' : 'orders'} · ${formatCurrency(activeCustomer.revenue)} revenue · ${RANGE_HINT.toLowerCase()} · drilled down from top customers above`}
                params={{ customer_id: activeCustomer.customer_id, ...rangeParams }}
                expectedCount={activeCustomer.order_count}
                onClose={() => setDrill(null)}
              />
            </div>
          )}
          {activeProduct && (
            <div className="mt-4">
              <OrdersDrilldown
                ref={drilldownRef}
                title={`Orders — ${activeProduct.name} (${activeProduct.code})`}
                summary={`${formatCurrency(activeProduct.revenue)} revenue from this product · ${activeProduct.quantity} units · ${RANGE_HINT.toLowerCase()} · drilled down from top products above`}
                params={{ product_id: activeProduct.product_id, ...rangeParams }}
                note="Totals are whole-order totals, which can include other products."
                onClose={() => setDrill(null)}
              />
            </div>
          )}
        </>
      ) : null}
    </AppLayout>
  )
}
