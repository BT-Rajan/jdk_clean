import { useCallback, useEffect, useRef, useState } from 'react'
import type { PagedResponse } from '@/types/common'
import { getApiErrorMessage } from '@/lib/apiError'

const SEARCH_DEBOUNCE_MS = 350

/**
 * Drives a single list page: page number, a debounced search box, an
 * optional status filter, and the fetch/loading/error state around it.
 * Every module's ListPage (customers, suppliers, raw materials, products,
 * quotations, orders, users) uses this the same way, matching the
 * page/search/status shape backend/app/api/deps.py:ListParams expects.
 */
export function usePagedResource<T>(
  fetcher: (params: { page: number; search?: string; status?: string }) => Promise<PagedResponse<T>>,
) {
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [status, setStatus] = useState('')
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
    async (targetPage: number, search: string, statusFilter: string) => {
      const thisRequest = ++requestId.current
      setLoading(true)
      setError(null)
      try {
        const result = await fetcher({
          page: targetPage,
          search: search || undefined,
          status: statusFilter || undefined,
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
    load(page, debouncedSearch, status)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, debouncedSearch, status])

  const refetch = useCallback(() => load(page, debouncedSearch, status), [load, page, debouncedSearch, status])

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
    loading,
    error,
    refetch,
  }
}
