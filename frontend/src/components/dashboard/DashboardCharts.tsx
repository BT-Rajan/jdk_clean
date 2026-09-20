import type { ReactNode } from 'react'
import { Alert, Button, EmptyState, GlassCard, Pagination, Spinner } from '@/components/ui'
import { useClientPagination } from '@/hooks/useClientPagination'

/**
 * Shared building blocks for the graphs on each department dashboard
 * (Sales, Purchasing, Production, Warehouse): a titled chart card, and the
 * panel that opens under the graphs when a bar is clicked to show the
 * records behind it. Chart styling itself comes from
 * pages/reports/chartHelpers so dashboard graphs match the /reports/* ones.
 */

interface ChartCardProps {
  title: string
  /** One-line hint under the title, e.g. "Click a bar to see the orders." */
  hint?: string
  loading?: boolean
  isEmpty?: boolean
  emptyTitle?: string
  emptyMessage?: string
  children: ReactNode
}

export function ChartCard({ title, hint, loading, isEmpty, emptyTitle, emptyMessage, children }: ChartCardProps) {
  return (
    <GlassCard className="min-w-0 p-6">
      <h2 className="mb-1 font-display text-lg font-medium text-white">{title}</h2>
      {hint && <p className="mb-4 text-xs text-white/40">{hint}</p>}
      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Spinner size={24} className="text-gold-300" />
        </div>
      ) : isEmpty ? (
        <EmptyState title={emptyTitle ?? 'Nothing to show'} message={emptyMessage ?? 'There is no data for this range yet.'} />
      ) : (
        <div className="h-64 w-full">{children}</div>
      )}
    </GlassCard>
  )
}

export interface DrilldownColumn<T> {
  header: string
  cell: (row: T) => ReactNode
}

interface DrilldownPanelProps<T> {
  title: string
  subtitle?: string
  items: T[] | null
  loading: boolean
  error: string | null
  columns: DrilldownColumn<T>[]
  rowKey: (row: T) => string | number
  emptyTitle: string
  emptyMessage: string
  onClear: () => void
}

/** The records behind a clicked bar -- paged 5 at a time like every other list. */
export function DrilldownPanel<T>({
  title,
  subtitle,
  items,
  loading,
  error,
  columns,
  rowKey,
  emptyTitle,
  emptyMessage,
  onClear,
}: DrilldownPanelProps<T>) {
  // `title` changes with every new click, so a fresh drill-down starts on page 1.
  const pager = useClientPagination(items, { resetKey: title })

  return (
    <GlassCard className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-6 py-4">
        <div>
          <h2 className="font-display text-lg font-medium text-white capitalize">{title}</h2>
          {subtitle && <p className="mt-1 text-xs text-white/40">{subtitle}</p>}
        </div>
        <Button variant="ghost" size="sm" onClick={onClear}>
          Clear
        </Button>
      </div>
      <Alert variant="error">{error}</Alert>
      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner size={24} className="text-gold-300" />
        </div>
      ) : !items || items.length === 0 ? (
        <EmptyState title={emptyTitle} message={emptyMessage} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-xs tracking-wide text-white/40 uppercase">
                {columns.map((col) => (
                  <th key={col.header} className="px-6 py-4 font-medium">
                    {col.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pager.pageItems.map((row) => (
                <tr key={rowKey(row)} className="border-b border-white/5 last:border-0 hover:bg-white/[0.03]">
                  {columns.map((col) => (
                    <td key={col.header} className="px-6 py-4">
                      {col.cell(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination className="px-6 pb-4" {...pager.pagerProps} />
    </GlassCard>
  )
}
