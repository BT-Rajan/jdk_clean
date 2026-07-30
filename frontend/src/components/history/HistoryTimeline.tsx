import { useState } from 'react'
import { GlassCard, Spinner } from '@/components/ui'
import { getHistory } from '@/api/history'
import type { HistoryEntry } from '@/api/history'
import { getApiErrorMessage } from '@/lib/apiError'
import { formatDateTime } from '@/lib/dateFormat'

interface HistoryTimelineProps {
  /** The API path this record's history lives under, e.g. '/api/orders'
   * for an order, '/api/feasibility' for a feasibility check. Matches
   * whatever prefix that module's router uses. */
  resourcePath: string
  id: number
}

function describeEntry(entry: HistoryEntry): string {
  switch (entry.action) {
    case 'CREATE':
      return 'Created'
    case 'DELETE':
      return 'Deleted'
    case 'RESTORE':
      return 'Restored'
    case 'UPDATE': {
      const field = entry.field_name?.replace(/_/g, ' ') ?? 'a field'
      if (entry.old_value === null && entry.new_value !== null) return `Set ${field} to "${entry.new_value}"`
      if (entry.old_value !== null && entry.new_value === null) return `Cleared ${field}`
      return `Changed ${field} from "${entry.old_value}" to "${entry.new_value}"`
    }
    default:
      return entry.action
  }
}

/** The audit trail every module already records but nothing used to
 * show -- one shared component instead of building this per page.
 * Collapsed by default; fetches only when first expanded, so it costs
 * nothing on pages where nobody looks at it. */
export function HistoryTimeline({ resourcePath, id }: HistoryTimelineProps) {
  const [open, setOpen] = useState(false)
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleToggle() {
    const next = !open
    setOpen(next)
    if (next && entries === null && !loading) {
      setLoading(true)
      getHistory(resourcePath, id)
        .then(setEntries)
        .catch((err) => setError(getApiErrorMessage(err)))
        .finally(() => setLoading(false))
    }
  }

  return (
    <GlassCard className="p-6">
      <button
        type="button"
        onClick={handleToggle}
        className="flex w-full items-center justify-between text-left"
      >
        <h2 className="font-display text-base font-medium text-white">History</h2>
        <span className="text-sm text-white/40">{open ? 'Hide ▲' : 'Show ▼'}</span>
      </button>

      {open && (
        <div className="mt-4">
          {loading ? (
            <div className="flex justify-center py-6">
              <Spinner size={20} className="text-gold-300" />
            </div>
          ) : error ? (
            <p className="text-sm text-red-300">{error}</p>
          ) : !entries || entries.length === 0 ? (
            <p className="text-sm text-white/40">No history recorded.</p>
          ) : (
            <ul className="space-y-3">
              {entries.map((entry, i) => (
                <li key={i} className="border-l border-white/10 pl-4 text-sm">
                  <p className="text-white/80">{describeEntry(entry)}</p>
                  <p className="mt-0.5 text-xs text-white/40">
                    {entry.changed_by_name ?? 'System'} · {formatDateTime(entry.changed_at)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </GlassCard>
  )
}
