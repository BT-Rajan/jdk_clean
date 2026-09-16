import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
  customer_id?: number;
}

const DEFAULT_PAGE_SIZE = 20;
const CACHE_KEY_PREFIX = 'paged_list_cache:';

interface CacheEntry<T> {
  items: T[];
  total: number;
  total_pages: number;
}

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
 *
 * `cacheKey`, if given, persists the last successful unfiltered page-1
 * result to AsyncStorage and restores it on mount before the first live
 * fetch resolves -- so opening the app with a dead connection shows the
 * last-known list instead of a blank screen. If a later refresh then
 * fails while there's already something on screen (cached or live), the
 * failure is treated as `stale` (keep showing what's there) rather than
 * a hard `error` (which would otherwise read as "nothing here" even
 * though there plainly is).
 */
export function usePagedList<T>(
  fetcher: (params: FetchParams) => Promise<PagedResponse<T>>,
  getErrorMessage: (err: any) => string = (err) => err?.message ?? 'Something went wrong.',
  cacheKey?: string,
  initialCustomerId?: number,
) {
  const [items, setItemsState] = useState<T[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearchState] = useState('');
  const [status, setStatusState] = useState('');
  const [customerId, setCustomerIdState] = useState<number | undefined>(initialCustomerId);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);

  // Refs, not just state, so load() always reads the latest values even
  // when called synchronously right after a setter (state updates aren't
  // visible until the next render), and so it can tell "do we already
  // have something on screen" apart from stale closure state.
  const searchRef = useRef('');
  const statusRef = useRef('');
  const customerIdRef = useRef<number | undefined>(initialCustomerId);
  const pageRef = useRef(1);
  const totalPagesRef = useRef(1);
  const itemsRef = useRef<T[]>([]);
  const requestId = useRef(0);
  // Kept out of load()'s dependency array on purpose -- callers often pass
  // an inline arrow closing over a translation function, and including it
  // there would recreate load/refresh (and re-trigger useFocusEffect) on
  // every render instead of only when the fetcher itself changes.
  const getErrorMessageRef = useRef(getErrorMessage);
  getErrorMessageRef.current = getErrorMessage;

  const setItems = useCallback((updater: T[] | ((prev: T[]) => T[])) => {
    setItemsState((prev) => {
      const next = typeof updater === 'function' ? (updater as (p: T[]) => T[])(prev) : updater;
      itemsRef.current = next;
      return next;
    });
  }, []);

  // One-time cache hydration, before anything has loaded live -- guarded
  // by requestId so a fast live response that beats this read wins.
  useEffect(() => {
    if (!cacheKey) return;
    AsyncStorage.getItem(CACHE_KEY_PREFIX + cacheKey)
      .then((raw) => {
        if (!raw || requestId.current !== 0) return;
        const cached: CacheEntry<T> = JSON.parse(raw);
        setItems(cached.items);
        setTotal(cached.total);
        setTotalPages(cached.total_pages);
        totalPagesRef.current = cached.total_pages;
        setStale(true);
      })
      .catch(() => {});
  }, [cacheKey, setItems]);

  const load = useCallback(
    async (targetPage: number, replace: boolean) => {
      const thisRequest = ++requestId.current;
      if (replace) setLoading(true);
      else setLoadingMore(true);
      try {
        const res = await fetcher({
          page: targetPage,
          page_size: DEFAULT_PAGE_SIZE,
          search: searchRef.current || undefined,
          status: statusRef.current || undefined,
          customer_id: customerIdRef.current,
        });
        if (thisRequest !== requestId.current) return;
        setItems((prev) => (replace ? res.items : [...prev, ...res.items]));
        pageRef.current = res.page;
        totalPagesRef.current = res.total_pages;
        setPage(res.page);
        setTotalPages(res.total_pages);
        setTotal(res.total);
        setError(null);
        setStale(false);
        // Only the plain, unfiltered first page is worth caching -- it's
        // the one view guaranteed to be useful again on a cold, offline
        // launch; a cached search/status/client result would just as often
        // be the wrong slice to show back.
        if (cacheKey && targetPage === 1 && !searchRef.current && !statusRef.current && !customerIdRef.current) {
          const entry: CacheEntry<T> = { items: res.items, total: res.total, total_pages: res.total_pages };
          AsyncStorage.setItem(CACHE_KEY_PREFIX + cacheKey, JSON.stringify(entry)).catch(() => {});
        }
      } catch (err: any) {
        if (thisRequest !== requestId.current) return;
        if (itemsRef.current.length > 0) {
          // Something is already on screen (cached or from an earlier
          // successful fetch) -- a failed refresh/load-more shouldn't
          // blank that out from under the user or read as "nothing
          // here"; flag it as stale instead of a hard error.
          setStale(true);
        } else {
          setError(getErrorMessageRef.current(err));
        }
      } finally {
        if (thisRequest === requestId.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [fetcher, cacheKey],
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

  /** Changing the client filter re-fetches immediately, same as status. */
  const setCustomerId = useCallback(
    (v: number | undefined) => {
      customerIdRef.current = v;
      setCustomerIdState(v);
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
    // True when what's on screen is cached/stale rather than confirmed
    // fresh -- e.g. no connection right now. Distinct from `error`: there
    // IS something to show, it just might be out of date.
    stale,
    // Exposed so a screen can surface a non-list mutation's own error
    // (e.g. a failed row action) through the same banner.
    setError,
    search,
    setSearch,
    status,
    setStatus,
    customerId,
    setCustomerId,
    refresh,
    loadMore,
    hasMore: page < totalPages,
  };
}
