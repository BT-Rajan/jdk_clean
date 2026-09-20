import { useMemo, useState } from 'react'
import { DEFAULT_PAGE_SIZE } from '@/lib/constants'

/**
 * Client-side paging for a list that is already fully loaded (the
 * dashboard / department home pages fetch everything up front and sort it
 * locally). Spread `pagerProps` straight onto <Pagination />.
 *
 * The current page is clamped to the last page, so a list that shrinks
 * (e.g. after a refetch) never leaves the user on an empty page.
 */
export function useClientPagination<T>(items: T[], pageSize: number = DEFAULT_PAGE_SIZE) {
  const [requestedPage, setPage] = useState(1)
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize))
  const page = Math.min(requestedPage, totalPages)

  const pageItems = useMemo(() => items.slice((page - 1) * pageSize, page * pageSize), [items, page, pageSize])

  return {
    pageItems,
    pagerProps: { page, totalPages, total: items.length, onPageChange: setPage },
  }
}
