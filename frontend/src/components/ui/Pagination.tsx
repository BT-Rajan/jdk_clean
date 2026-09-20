import { Button } from './Button'
import { cn } from '@/lib/cn'

interface PaginationProps {
  page: number
  totalPages: number
  total: number
  onPageChange: (page: number) => void
  /** Replaces the default `mt-6` outer spacing (e.g. when rendered inside a card). */
  className?: string
}

export function Pagination({ page, totalPages, total, onPageChange, className }: PaginationProps) {
  if (totalPages <= 1) return null

  return (
    <div className={cn('flex items-center justify-between text-sm text-white/50', className ?? 'mt-6')}>
      <p>
        Page {page} of {totalPages} · {total} total
      </p>
      <div className="flex gap-2">
        <Button
          variant="ghost"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  )
}
