import { cn } from '@/lib/cn'

interface SortableHeaderProps {
  label: string
  /** The bare field name this column sorts by, e.g. 'name' or 'created_at'. */
  field: string
  /** Current sort string from usePagedResource, e.g. '' | 'name' | '-name'. */
  sort: string
  onSort: (field: string) => void
  className?: string
}

/**
 * A <th> that toggles sort on click: unsorted -> ascending -> descending ->
 * unsorted. Used identically across every list table (customers, suppliers,
 * raw materials, products, quotations, orders, users, inventory movements)
 * so sorting behaves the same way everywhere in the app.
 */
export function SortableHeader({ label, field, sort, onSort, className }: SortableHeaderProps) {
  const isActive = sort === field || sort === `-${field}`
  const direction = sort.startsWith('-') ? 'desc' : 'asc'

  return (
    <th className={cn('px-6 py-4 font-medium', className)}>
      <button
        type="button"
        onClick={() => onSort(field)}
        className={cn(
          'flex items-center gap-1.5 whitespace-nowrap transition-colors hover:text-white',
          isActive && 'text-gold-300',
        )}
        aria-label={`Sort by ${label}${isActive ? (direction === 'asc' ? ', ascending' : ', descending') : ''}`}
      >
        {label}
        <span className="text-[9px] leading-none" aria-hidden="true">
          {isActive ? (direction === 'asc' ? '▲' : '▼') : '⇅'}
        </span>
      </button>
    </th>
  )
}
