import { useCallback, useEffect, useRef, useState } from 'react'
import type { PagedResponse } from '@/types/common'
import { getApiErrorMessage } from '@/lib/apiError'
import { DEFAULT_PAGE_SIZE } from '@/lib/constants'

const SEARCH_DEBOUNCE_MS = 350

/**
 * Drives a single list page: page number, a debounced search box, an
 * optional status filter, and the fetch/loading/error state around it.
 * Every module's ListPage (customers, suppliers, raw materials, products,
 * quotations, orders, users) uses this the same way, matching the
 * page/search/status shape backend/app/api/deps.py:ListParams expects.
 * Always requests DEFAULT_PAGE_SIZE rows/page -- see lib/constants.ts --
 * so every list table in the app paginates identically.
 */
export function usePagedResource<T>(
  fetcher: (params: {
    page: number
    page_size: number
    search?: string
    status?: string
    sort?: string
  }) => Promise<PagedResponse<T>>,
) {
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [status, setStatus] = useState('')
  const [sort, setSort] = useState('')
  const [data, setData] = useState<PagedResponse<T> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const requestId = useRef(0)

  // Debounce the raw search input before it drives a fetch, and reset to
  // page 1 whenever the effective query changes underneath the user.
  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedSearch(searchInput)
      setPage(1)
    }, SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(handle)
  }, [searchInput])

  const load = useCallback(
    async (targetPage: number, search: string, statusFilter: string, sortParam: string) => {
      const thisRequest = ++requestId.current
      setLoading(true)
      setError(null)
      try {
        const result = await fetcher({
          page: targetPage,
          page_size: DEFAULT_PAGE_SIZE,
          search: search || undefined,
          status: statusFilter || undefined,
          sort: sortParam || undefined,
        })
        if (thisRequest === requestId.current) {
          setData(result)
        }
      } catch (err) {
        if (thisRequest === requestId.current) {
          setError(getApiErrorMessage(err))
        }
      } finally {
        if (thisRequest === requestId.current) {
          setLoading(false)
        }
      }
    },
    [fetcher],
  )

  useEffect(() => {
    load(page, debouncedSearch, status, sort)
    // `load` is included (not just page/search/status/sort) so that a
    // caller whose `fetcher` identity changes -- e.g. a list page with
    // its own extra filters (role, department, ...) closed over in a
    // useCallback -- actually triggers a refetch when those filters
    // change. `load` itself is memoized on [fetcher], so this is a
    // no-op for every other list page, which passes a fetcher with a
    // stable ([]) dependency array.
  }, [page, debouncedSearch, status, sort, load])

  const refetch = useCallback(
    () => load(page, debouncedSearch, status, sort),
    [load, page, debouncedSearch, status, sort],
  )

  // Three-state toggle per column: unsorted -> ascending -> descending ->
  // unsorted again. Also snaps back to page 1, since the current page
  // otherwise wouldn't correspond to the newly-ordered results.
  const toggleSort = useCallback((field: string) => {
    setSort((current) => {
      if (current === field) return `-${field}`
      if (current === `-${field}`) return ''
      return field
    })
    setPage(1)
  }, [])

  return {
    items: data?.items ?? [],
    total: data?.total ?? 0,
    totalPages: data?.total_pages ?? 1,
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
    refetch,
  }
}
