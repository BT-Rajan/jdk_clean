import { AppLayout } from '@/components/layout/AppLayout'
import { EmptyState, GlassCard, PageHeader } from '@/components/ui'

interface ReportPlaceholderProps {
  title: string
  subtitle: string
}

/** Every /reports/* route renders this until each report is actually
 * built (real data/charts are a separate follow-up) -- gives the nav
 * structure a real destination today instead of a dead link. */
function ReportPlaceholder({ title, subtitle }: ReportPlaceholderProps) {
  return (
    <AppLayout>
      <PageHeader title={title} subtitle={subtitle} />
      <GlassCard className="overflow-hidden">
        <EmptyState title="Coming soon" message="This report is on the roadmap and isn't built yet." />
      </GlassCard>
    </AppLayout>
  )
}

export function SalesReportPage() {
  return <ReportPlaceholder title="Sales report" subtitle="Revenue, orders, and quotation performance over time." />
}

export function ProductionReportPage() {
  return (
    <ReportPlaceholder
      title="Production report"
      subtitle="Batches produced, capacity utilization, and material discrepancies."
    />
  )
}

export function PurchasingReportPage() {
  return (
    <ReportPlaceholder title="Purchasing report" subtitle="Purchase order spend, supplier performance, and lead times." />
  )
}

export function InventoryReportPage() {
  return <ReportPlaceholder title="Inventory report" subtitle="Stock levels, movement history, and reorder trends." />
}
