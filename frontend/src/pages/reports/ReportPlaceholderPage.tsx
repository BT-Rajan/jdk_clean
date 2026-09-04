import { AppLayout } from '@/components/layout/AppLayout'
import { EmptyState, GlassCard, PageHeader } from '@/components/ui'

interface ReportPlaceholderProps {
  title: string
  subtitle: string
}

/** Every /reports/* route besides Sales Report (see SalesReportPage.tsx,
 * which has real charts/data) renders this until it's actually built --
 * gives the nav structure a real destination today instead of a dead
 * link. */
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
