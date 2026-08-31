import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert, GlassCard, Spinner } from '@/components/ui'
import { apiClient } from '@/api/client'
import { getApiErrorMessage } from '@/lib/apiError'

interface WhereUsedItem {
  id: number
  label: string
  route: string
}

interface WhereUsedGroup {
  label: string
  total: number
  items: WhereUsedItem[]
}

type WhereUsedResponse = Record<string, WhereUsedGroup>

/**
 * The one "Where Used" panel every master record page with a real
 * relational footprint drops in -- see backend/app/services/where_used_service.py.
 * Always read live from the referencing tables, never a synced list, so
 * this can't show something that isn't (or hide something that is)
 * actually true.
 */
export function WhereUsedPanel({ resourcePath, id }: { resourcePath: string; id: number }) {
  const [data, setData] = useState<WhereUsedResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    apiClient
      .get<WhereUsedResponse>(`${resourcePath}/${id}/where-used`)
      .then((res) => {
        if (!cancelled) setData(res.data)
      })
      .catch((err) => {
        if (!cancelled) setError(getApiErrorMessage(err))
      })
    return () => {
      cancelled = true
    }
  }, [resourcePath, id])

  if (error) {
    return <Alert variant="error">{error}</Alert>
  }

  if (!data) {
    return (
      <GlassCard className="flex justify-center p-8">
        <Spinner size={20} className="text-gold-300" />
      </GlassCard>
    )
  }

  const groups = Object.values(data)
  const usedGroups = groups.filter((g) => g.total > 0)

  return (
    <GlassCard className="p-8">
      <h2 className="font-display text-lg font-medium text-white">Where used</h2>
      <p className="mt-1 text-sm text-white/50">
        Read live from every module that references this record -- not a separately maintained list.
      </p>
      {usedGroups.length === 0 ? (
        <p className="mt-4 text-sm text-white/40">Not referenced anywhere yet.</p>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {usedGroups.map((group) => (
            <div key={group.label} className="rounded-xl border border-white/10 p-4">
              <p className="text-xs font-medium tracking-wide text-white/50 uppercase">
                {group.label} ({group.total})
              </p>
              <ul className="mt-2 flex flex-col gap-1">
                {group.items.map((item) => (
                  <li key={item.id}>
                    <Link to={item.route} className="text-sm text-gold-300 hover:text-gold-200">
                      {item.label}
                    </Link>
                  </li>
                ))}
                {group.total > group.items.length && (
                  <li className="text-xs text-white/30">+ {group.total - group.items.length} more</li>
                )}
              </ul>
            </div>
          ))}
        </div>
      )}
    </GlassCard>
  )
}
