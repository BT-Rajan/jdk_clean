import { useEffect, useMemo, useRef, useState } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'
import { Alert, Spinner } from '@/components/ui'
import { getSalesReport } from '@/api/reports'
import { getApiErrorMessage } from '@/lib/apiError'
import { CURRENCY_CODE } from '@/lib/currency'
import type { SalesReport, SalesReportMonthly } from '@/types/reports'
import { customerRevenueRows, productRevenueRows } from '@/pages/reports/revenueRows'
import { RevenueBars } from '@/pages/reports/RevenueBars'
import { RevenueTrendChart } from '@/pages/reports/RevenueTrendChart'
import { buildFunnel, buildFunnelRecords } from '@/pages/reports/salesReportModel'
import { Panel, SalesFunnel } from '@/pages/reports/SalesReportPanels'
import { useSalesPipeline } from '@/pages/reports/useSalesPipeline'
import { FunnelDrilldown } from './FunnelDrilldown'
import { MonthDrilldown } from './MonthDrilldown'

const DASHBOARD_MONTHS = 12
const RANGE_HINT = `Last ${DASHBOARD_MONTHS} months`

/**
 * The Sales dashboard: the same funnel, revenue trend, top customers and
 * top products the Sales report shows (same API, same charts), laid out as
 * two rows that fill the screen. Clicking a funnel stage or a month on the
 * revenue trend opens the records behind it in a panel under the rows (one
 * at a time); the other drill-downs (status, customer, product) live on the
 * Sales report.
 */
export function SalesHomePage() {
  const [report, setReport] = useState<SalesReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { pipeline, loading: pipelineLoading } = useSalesPipeline({ withReadyToShip: false })
  const [selectedStage, setSelectedStage] = useState<string | null>(null)
  const [selectedMonth, setSelectedMonth] = useState<{ year: number; month: number } | null>(null)
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
  const activeStage = funnel?.find((s) => s.key === selectedStage) ?? null
  const activeMonth = report?.monthly.find((m) => m.year === selectedMonth?.year && m.month === selectedMonth?.month) ?? null

  // One drill-down open at a time: picking one closes the other.
  const toggleStage = (key: string) => {
    setSelectedMonth(null)
    setSelectedStage((cur) => (cur === key ? null : key))
  }
  const toggleMonth = (row: SalesReportMonthly) => {
    setSelectedStage(null)
    setSelectedMonth((cur) => (cur?.year === row.year && cur.month === row.month ? null : { year: row.year, month: row.month }))
  }
  const stageRecords = useMemo(
    () => (report && selectedStage ? buildFunnelRecords(selectedStage, report, pipeline) : null),
    [report, pipeline, selectedStage],
  )

  // The panel opens below the fold on a compact screen -- bring it into view
  // so a click visibly does something.
  useEffect(() => {
    if (!activeStage && !activeMonth) return
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    drilldownRef.current?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
  }, [activeStage?.key, activeMonth?.year, activeMonth?.month])

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
                  <RevenueTrendChart months={report.monthly} onSelectMonth={toggleMonth} selected={selectedMonth} />
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
                      activeKey={selectedStage}
                      onSelectStage={toggleStage}
                    />
                  </div>
                )}
              </Panel>
            </div>

            <div className="grid gap-4 lg:min-h-[16rem] lg:flex-1 lg:basis-0 lg:grid-cols-2">
              <Panel
                title="Top customers"
                hint={`Revenue in ${CURRENCY_CODE} · ${RANGE_HINT.toLowerCase()}`}
                bodyClassName="relative min-h-[18rem] lg:min-h-0"
              >
                <div className="absolute inset-0">
                  {customerRows.length === 0 ? (
                    <p className="py-6 text-center text-sm text-white/50">No revenue in this period.</p>
                  ) : (
                    <RevenueBars rows={customerRows} />
                  )}
                </div>
              </Panel>

              <Panel
                title="Top products"
                hint={`Revenue in ${CURRENCY_CODE} · ${RANGE_HINT.toLowerCase()}`}
                bodyClassName="relative min-h-[18rem] lg:min-h-0"
              >
                <div className="absolute inset-0">
                  {productRows.length === 0 ? (
                    <p className="py-6 text-center text-sm text-white/50">No revenue in this period.</p>
                  ) : (
                    <RevenueBars rows={productRows} />
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
                onClose={() => setSelectedStage(null)}
              />
            </div>
          )}
          {activeMonth && (
            <div className="mt-4">
              <MonthDrilldown ref={drilldownRef} month={activeMonth} onClose={() => setSelectedMonth(null)} />
            </div>
          )}
        </>
      ) : null}
    </AppLayout>
  )
}
