import { useEffect, useState } from 'react'
import type { PagedResponse } from '@/types/common'

/**
 * Loads every "active" row of a reference list (suppliers, customers,
 * products) for use in a <select>, by walking pages of the same paged
 * endpoints the list pages use. Reference lists are expected to be small
 * enough (tens to low hundreds of rows) that fetching them fully, once,
 * beats re-implementing server-side search inside every dropdown.
 */
export function useSelectOptions<T>(fetcher: () => Promise<PagedResponse<T>>) {
  const [options, setOptions] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetcher()
      .then((result) => {
        if (!cancelled) setOptions(result.items)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load options')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { options, loading, error }
}
