import type { ReactNode } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'
import { Alert, Button, EmptyState, GlassCard, Pagination, SelectField, SortableHeader, Spinner, TextField } from '@/components/ui'
import { usePagedResource } from '@/hooks/usePagedResource'
import type { PagedResponse } from '@/types/common'

export interface MasterListColumn<T> {
  key: string
  label: string
  /** Omit for an unsortable column (e.g. a computed/joined value). */
  sortable?: boolean
  render: (item: T) => ReactNode
  /** Right-align numeric columns. */
  align?: 'left' | 'right' | 'center'
}

export interface MasterListPageProps<T> {
  title: string
  /** Plural noun used in the count line and empty state, e.g. "machines". */
  noun: string
  fetcher: (params: {
    page: number
    page_size?: number
    search?: string
    status?: string
    sort?: string
  }) => Promise<PagedResponse<T>>
  columns: MasterListColumn<T>[]
  rowKey: (item: T) => string | number
  searchPlaceholder?: string
  /** Set false for a master with no status column (rare -- most have one). */
  hasStatusFilter?: boolean
  /** Set false to hide the free-text search box entirely, e.g. when a
   * master's extraFilters already cover how people narrow the list. */
  hasSearch?: boolean
  canCreate?: boolean
  createLabel?: string
  onCreate?: () => void
  /** Extra filter controls rendered next to search/status, e.g. a
   * category picker -- kept as a render prop rather than a config schema
   * so each master's genuinely different filters stay explicit. */
  extraFilters?: ReactNode
}

/**
 * The one list-page shell for a master: search + status filter + sortable
 * table + pagination, over the shared usePagedResource hook. A master
 * supplies its own columns (domain-specific), everything else is common.
 * See app/api/common.py's build_crud_router for the backend half of this
 * pairing -- every list here talks to a router built the same way.
 */
export function MasterListPage<T>({
  title,
  noun,
  fetcher,
  columns,
  rowKey,
  searchPlaceholder = 'Search…',
  hasStatusFilter = true,
  hasSearch = true,
  canCreate = false,
  createLabel,
  onCreate,
  extraFilters,
}: MasterListPageProps<T>) {
  const {
    items,
    total,
    totalPages,
    page,
    setPage,
    searchInput,
    setSearchInput,
    status,
    setStatus,
    sort,
    toggleSort,
    loading,
    error,
  } = usePagedResource(fetcher)

  return (
    <AppLayout>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-medium text-white">{title}</h1>
          <p className="mt-2 text-sm text-white/50">
            {total} {noun} on file
          </p>
        </div>
        {canCreate && onCreate && <Button onClick={onCreate}>{createLabel ?? `New ${noun.replace(/s$/, '')}`}</Button>}
      </div>

      {(hasSearch || hasStatusFilter) && (
        <div
          className="mb-6 grid grid-cols-1 gap-4"
          style={{
            gridTemplateColumns: hasSearch && hasStatusFilter ? '1fr 220px' : hasStatusFilter ? '220px' : '1fr',
          }}
        >
          {hasSearch && (
            <TextField
              label="Search"
              placeholder={searchPlaceholder}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          )}
          {hasStatusFilter && (
            <SelectField label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </SelectField>
          )}
        </div>
      )}
      {extraFilters}

      <Alert variant="error">{error}</Alert>

      <GlassCard className="overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16">
            <Spinner size={24} className="text-gold-300" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState title={`No ${noun} found`} message="Try a different search or add a new record." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-xs tracking-wide text-white/40 uppercase">
                  {columns.map((col) =>
                    col.sortable ? (
                      <SortableHeader key={col.key} label={col.label} field={col.key} sort={sort} onSort={toggleSort} />
                    ) : (
                      <th key={col.key} className="px-6 py-4 font-medium">
                        {col.label}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={rowKey(item)} className="border-b border-white/5 last:border-0 hover:bg-white/[0.03]">
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={
                          col.align === 'right' ? 'px-6 py-4 text-right' : col.align === 'center' ? 'px-6 py-4 text-center' : 'px-6 py-4'
                        }
                      >
                        {col.render(item)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>

      <Pagination page={page} totalPages={totalPages} total={total} onPageChange={setPage} />
    </AppLayout>
  )
}
