import { useState } from 'react'
import { GlassCard, Spinner, Tabs } from '@/components/ui'
import { getHistory, getHistoryAtUrl } from '@/api/history'
import type { HistoryEntry } from '@/api/history'
import { getApiErrorMessage } from '@/lib/apiError'
import { formatDateTime } from '@/lib/dateFormat'

export interface HistorySource {
  id: string
  label: string
  /** Either resourcePath+entityId (for a plain /{id}/history route) or a
   * full url (for a route that doesn't follow that pattern, e.g. BOM
   * history at /api/products/{id}/bom/history) -- same two shapes
   * HistoryTimeline itself accepts, just per-tab here. */
  resourcePath?: string
  entityId?: number
  url?: string
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

/** One "History" card covering several related audit trails as tabs
 * instead of a separate collapsible section per trail -- a record whose
 * edit history spans more than one table (e.g. a product's own fields,
 * its BOM lines, its packaging lines) used to get one HistoryTimeline
 * per table, stacked down the page; three near-identical "History"
 * headers in a row read as clutter/duplication rather than three
 * genuinely different trails. Collapsed by default; each tab fetches
 * (and caches) only once actually selected, so switching tabs after the
 * first fetch is instant and a source nobody looks at costs nothing. */
export function MultiHistoryTimeline({ sources, title = 'History' }: { sources: HistorySource[]; title?: string }) {
  const [open, setOpen] = useState(false)
  const [activeId, setActiveId] = useState(sources[0]?.id ?? '')
  const [entriesById, setEntriesById] = useState<Record<string, HistoryEntry[]>>({})
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [errorById, setErrorById] = useState<Record<string, string>>({})

  function load(source: HistorySource) {
    if (source.id in entriesById || loadingId === source.id) return
    setLoadingId(source.id)
    const request = source.url ? getHistoryAtUrl(source.url) : getHistory(source.resourcePath ?? '', source.entityId ?? 0)
    request
      .then((entries) => setEntriesById((prev) => ({ ...prev, [source.id]: entries })))
      .catch((err) => setErrorById((prev) => ({ ...prev, [source.id]: getApiErrorMessage(err) })))
      .finally(() => setLoadingId(null))
  }

  function handleToggle() {
    const next = !open
    setOpen(next)
    if (next) {
      const active = sources.find((s) => s.id === activeId)
      if (active) load(active)
    }
  }

  function handleTabChange(id: string) {
    setActiveId(id)
    const source = sources.find((s) => s.id === id)
    if (source) load(source)
  }

  const activeEntries = entriesById[activeId]
  const activeError = errorById[activeId]
  const isLoadingActive = loadingId === activeId

  return (
    <GlassCard className="p-6">
      <button type="button" onClick={handleToggle} className="flex w-full items-center justify-between text-left">
        <h2 className="font-display text-base font-medium text-white">{title}</h2>
        <span className="text-sm text-white/40">{open ? 'Hide ▲' : 'Show ▼'}</span>
      </button>

      {open && (
        <div className="mt-4">
          {sources.length > 1 && (
            <Tabs
              items={sources.map((s) => ({ id: s.id, label: s.label }))}
              activeId={activeId}
              onChange={handleTabChange}
              size="sm"
              className="mb-4"
            />
          )}

          {isLoadingActive ? (
            <div className="flex justify-center py-6">
              <Spinner size={20} className="text-gold-300" />
            </div>
          ) : activeError ? (
            <p className="text-sm text-red-300">{activeError}</p>
          ) : !activeEntries || activeEntries.length === 0 ? (
            <p className="text-sm text-white/40">No history recorded.</p>
          ) : (
            <ul className="space-y-3">
              {activeEntries.map((entry, i) => (
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
