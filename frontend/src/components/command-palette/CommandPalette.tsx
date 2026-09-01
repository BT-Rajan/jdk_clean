import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { globalSearch } from '@/api/search'
import type { SearchResult } from '@/types/search'
import { getApiErrorMessage } from '@/lib/apiError'

export interface PaletteAction {
  id: string
  label: string
  hint?: string
  keywords?: string
  onSelect: () => void
}

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
  /** Static "go to" / quick-action commands -- pages, open calendar,
   * open notifications, open AI assistant, sign out. Always visible,
   * filtered by the typed query the same way search results are. */
  actions: PaletteAction[]
}

/** Groups flat search results by entity_label, preserving first-seen
 * order (backend already orders SEARCHABLE sensibly). */
function groupResults(results: SearchResult[]): [string, SearchResult[]][] {
  const groups = new Map<string, SearchResult[]>()
  for (const r of results) {
    const list = groups.get(r.entity_label) ?? []
    list.push(r)
    groups.set(r.entity_label, list)
  }
  return Array.from(groups.entries())
}

export function CommandPalette({ open, onClose, actions }: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setQuery('')
    setResults([])
    setSearchError(null)
    setActiveIndex(0)
    const raf = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(raf)
  }, [open])

  const filteredActions = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return actions
    return actions.filter((a) => `${a.label} ${a.keywords ?? ''}`.toLowerCase().includes(q))
  }, [actions, query])

  // Debounced global entity search -- only once the query is long
  // enough to be worth a round trip (matches the backend's own
  // 2-char minimum in search_service.search).
  useEffect(() => {
    if (!open) return
    const q = query.trim()
    if (q.length < 2) {
      setResults([])
      setSearching(false)
      return
    }
    setSearching(true)
    const timeout = setTimeout(() => {
      globalSearch(q)
        .then((res) => {
          setResults(res)
          setSearchError(null)
        })
        .catch((err) => setSearchError(getApiErrorMessage(err)))
        .finally(() => setSearching(false))
    }, 250)
    return () => clearTimeout(timeout)
  }, [query, open])

  const flatItems = useMemo(
    () => [...filteredActions.map((a) => ({ kind: 'action' as const, action: a })),
      ...results.map((r) => ({ kind: 'result' as const, result: r }))],
    [filteredActions, results],
  )

  function activate(index: number) {
    const item = flatItems[index]
    if (!item) return
    if (item.kind === 'action') {
      item.action.onSelect()
    } else {
      window.location.assign(item.result.url) // full nav is fine -- palette closes either way
    }
    onClose()
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      onClose()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, flatItems.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      activate(activeIndex)
    }
  }

  const groupedResults = groupResults(results)
  let runningIndex = filteredActions.length

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-start justify-center bg-ink-950/70 pt-[12vh] backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose()
          }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            className="glass-panel-strong m-4 max-h-[70vh] w-full max-w-2xl overflow-hidden rounded-2xl"
          >
            <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="shrink-0 text-white/40">
                <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.6" />
                <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setActiveIndex(0)
                }}
                onKeyDown={onKeyDown}
                placeholder="Go to a page, or search customers, orders, quotations…"
                className="w-full bg-transparent text-sm text-white placeholder:text-white/30 focus:outline-none"
              />
              <kbd className="rounded-md border border-white/10 px-1.5 py-0.5 text-[10px] text-white/30">Esc</kbd>
            </div>

            <div className="max-h-[52vh] overflow-y-auto p-2">
              {filteredActions.length > 0 && (
                <div className="mb-1">
                  <p className="px-2 py-1 text-[10px] font-medium tracking-wide text-white/30 uppercase">Go to</p>
                  {filteredActions.map((a, i) => (
                    <PaletteRow
                      key={a.id}
                      label={a.label}
                      hint={a.hint}
                      active={i === activeIndex}
                      onMouseEnter={() => setActiveIndex(i)}
                      onClick={() => activate(i)}
                    />
                  ))}
                </div>
              )}

              {searchError && <p className="px-2 py-2 text-xs text-red-300">{searchError}</p>}
              {searching && !searchError && <p className="px-2 py-2 text-xs text-white/30">Searching…</p>}

              {groupedResults.map(([label, group]) => (
                <div key={label} className="mb-1">
                  <p className="px-2 py-1 text-[10px] font-medium tracking-wide text-white/30 uppercase">{label}</p>
                  {group.map((r) => {
                    const index = runningIndex++
                    return (
                      <PaletteRow
                        key={`${r.entity}-${r.id}`}
                        label={r.title}
                        hint={r.subtitle ?? undefined}
                        active={index === activeIndex}
                        onMouseEnter={() => setActiveIndex(index)}
                        onClick={() => activate(index)}
                      />
                    )
                  })}
                </div>
              ))}

              {query.trim().length >= 2 && !searching && results.length === 0 && !searchError && (
                <p className="px-2 py-4 text-center text-xs text-white/30">No matching records.</p>
              )}
              {flatItems.length === 0 && query.trim().length < 2 && !searching && (
                <p className="px-2 py-4 text-center text-xs text-white/30">No matches.</p>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function PaletteRow({
  label,
  hint,
  active,
  onMouseEnter,
  onClick,
}: {
  label: string
  hint?: string
  active: boolean
  onMouseEnter: () => void
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onMouseEnter={onMouseEnter}
      onClick={onClick}
      className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors ${
        active ? 'bg-gold-500/15 text-gold-100' : 'text-white/70 hover:bg-white/5'
      }`}
    >
      <span>{label}</span>
      {hint && <span className="text-xs text-white/30">{hint}</span>}
    </button>
  )
}
