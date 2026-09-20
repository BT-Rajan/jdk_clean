import { useMemo, useState } from 'react'
import { DEFAULT_PAGE_SIZE } from '@/lib/constants'

const EMPTY: readonly never[] = []

interface Options {
  pageSize?: number
  /**
   * When this value changes (compared with Object.is) the list goes back to
   * page 1 -- e.g. a report drill-down whose rows are replaced when the
   * filter changes.
   */
  resetKey?: unknown
}

/**
 * Client-side paging for a list that is already fully loaded (the
 * dashboard / department home pages, report drill-downs and the related
 * record lists on detail pages all fetch everything up front). Spread
 * `pagerProps` straight onto <Pagination />.
 *
 * `items` may be null/undefined while loading. The current page is clamped
 * to the last page, so a list that shrinks (e.g. after a refetch) never
 * leaves the user on an empty page.
 */
export function useClientPagination<T>(items: readonly T[] | null | undefined, options: Options = {}) {
  const { pageSize = DEFAULT_PAGE_SIZE, resetKey } = options
  const list: readonly T[] = items ?? EMPTY

  const [state, setState] = useState({ page: 1, resetKey })
  let requestedPage = state.page
  if (!Object.is(state.resetKey, resetKey)) {
    // Adjusting state during render is React's supported way to reset
    // state when an input changes (no extra effect/render pass).
    setState({ page: 1, resetKey })
    requestedPage = 1
  }

  const totalPages = Math.max(1, Math.ceil(list.length / pageSize))
  const page = Math.min(requestedPage, totalPages)

  const pageItems = useMemo(() => list.slice((page - 1) * pageSize, page * pageSize), [list, page, pageSize])

  return {
    pageItems,
    /** Index of the first item on this page -- for numbering rows across pages. */
    offset: (page - 1) * pageSize,
    pagerProps: {
      page,
      totalPages,
      total: list.length,
      onPageChange: (next: number) => setState({ page: next, resetKey }),
    },
  }
}
