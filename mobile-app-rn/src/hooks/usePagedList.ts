import { useCallback, useRef, useState } from 'react';

export interface PagedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

interface FetchParams {
  page: number;
  page_size: number;
  search?: string;
  status?: string;
}

const DEFAULT_PAGE_SIZE = 20;

/**
 * Infinite-scroll pagination + status filter for a FlatList-backed list
 * screen -- mirrors web's usePagedResource.ts (page/search/status against
 * the same backend ListParams shape) but appends pages instead of jumping
 * between them, matching mobile's scroll-to-load-more convention. Before
 * this, every mobile list screen fetched a single fixed page_size and had
 * no status filter at all, so anything past that page (or any status
 * other than "all") was simply invisible with no indication more existed.
 *
 * `fetcher` must be stable (wrap it in useCallback with a [] dependency
 * array, same as web's list pages do) -- its identity is a dependency of
 * the internal load function.
 *
 * `getErrorMessage`, if given, turns a caught error into the string shown
 * to the user (e.g. `(err) => err?.message ?? t('clients', 'loadError')`);
 * defaults to the raw `err.message` with a generic fallback.
 */
export function usePagedList<T>(
  fetcher: (params: FetchParams) => Promise<PagedResponse<T>>,
  getErrorMessage: (err: any) => string = (err) => err?.message ?? 'Something went wrong.',
) {
  const [items, setItems] = useState<T[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearchState] = useState('');
  const [status, setStatusState] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs, not just state, so load() always reads the latest search/status
  // even when called synchronously right after setSearch/setStatus (state
  // updates aren't visible until the next render).
  const searchRef = useRef('');
  const statusRef = useRef('');
  const pageRef = useRef(1);
  const totalPagesRef = useRef(1);
  const requestId = useRef(0);
  // Kept out of load()'s dependency array on purpose -- callers often pass
  // an inline arrow closing over a translation function, and including it
  // there would recreate load/refresh (and re-trigger useFocusEffect) on
  // every render instead of only when the fetcher itself changes.
  const getErrorMessageRef = useRef(getErrorMessage);
  getErrorMessageRef.current = getErrorMessage;

  const load = useCallback(
    async (targetPage: number, replace: boolean) => {
      const thisRequest = ++requestId.current;
      if (replace) setLoading(true);
      else setLoadingMore(true);
      setError(null);
      try {
        const res = await fetcher({
          page: targetPage,
          page_size: DEFAULT_PAGE_SIZE,
          search: searchRef.current || undefined,
          status: statusRef.current || undefined,
        });
        if (thisRequest !== requestId.current) return;
        setItems((prev) => (replace ? res.items : [...prev, ...res.items]));
        pageRef.current = res.page;
        totalPagesRef.current = res.total_pages;
        setPage(res.page);
        setTotalPages(res.total_pages);
        setTotal(res.total);
      } catch (err: any) {
        if (thisRequest === requestId.current) setError(getErrorMessageRef.current(err));
      } finally {
        if (thisRequest === requestId.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [fetcher],
  );

  /** Re-fetches from page 1 with the current search/status -- pull-to-refresh,
   * initial load on focus, and search submit all use this. */
  const refresh = useCallback(() => load(1, true), [load]);

  const setSearch = useCallback((v: string) => {
    searchRef.current = v;
    setSearchState(v);
  }, []);

  /** Changing the filter re-fetches immediately, same as web's status
   * dropdown auto-resetting to page 1. */
  const setStatus = useCallback(
    (v: string) => {
      statusRef.current = v;
      setStatusState(v);
      load(1, true);
    },
    [load],
  );

  const loadMore = useCallback(() => {
    if (loadingMore || loading) return;
    if (pageRef.current >= totalPagesRef.current) return;
    load(pageRef.current + 1, false);
  }, [load, loading, loadingMore]);

  return {
    items,
    // Exposed raw so a screen can patch/remove a single row in place after
    // a mutation (e.g. delete, activate/deactivate) without a full refetch.
    setItems,
    total,
    totalPages,
    page,
    loading,
    loadingMore,
    error,
    // Exposed so a screen can surface a non-list mutation's own error
    // (e.g. a failed row action) through the same banner.
    setError,
    search,
    setSearch,
    status,
    setStatus,
    refresh,
    loadMore,
    hasMore: page < totalPages,
  };
}
