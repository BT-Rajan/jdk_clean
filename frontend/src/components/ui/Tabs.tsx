import { useRef } from 'react'
import type { KeyboardEvent } from 'react'
import { cn } from '@/lib/cn'

export interface TabItem {
  id: string
  label: string
  badge?: number
}

export interface TabsProps {
  items: TabItem[]
  activeId: string
  onChange: (id: string) => void
  size?: 'md' | 'sm'
  className?: string
}

/** Accessible horizontal tab list (WAI-ARIA tabs pattern: roving tabindex, arrow-key nav). */
export function Tabs({ items, activeId, onChange, size = 'md', className }: TabsProps) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({})

  function focusAndSelect(id: string) {
    onChange(id)
    refs.current[id]?.focus()
  }

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return
    e.preventDefault()
    const last = items.length - 1
    const next =
      e.key === 'ArrowRight' ? (index === last ? 0 : index + 1) :
      e.key === 'ArrowLeft' ? (index === 0 ? last : index - 1) :
      e.key === 'Home' ? 0 : last
    focusAndSelect(items[next].id)
  }

  return (
    <div
      role="tablist"
      aria-orientation="horizontal"
      className={cn('flex gap-1 overflow-x-auto border-b border-white/10', className)}
    >
      {items.map((item, index) => {
        const active = item.id === activeId
        return (
          <button
            key={item.id}
            ref={(el) => { refs.current[item.id] = el }}
            type="button"
            role="tab"
            id={`tab-${item.id}`}
            aria-selected={active}
            aria-controls={`tabpanel-${item.id}`}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(item.id)}
            onKeyDown={(e) => onKeyDown(e, index)}
            className={cn(
              'shrink-0 whitespace-nowrap border-b-2 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent',
              size === 'md' ? 'px-4 py-2 text-sm' : 'px-3 py-1.5 text-xs',
              active ? 'border-gold-400 text-white' : 'border-transparent text-white/50 hover:text-white/80',
            )}
          >
            {item.label}
            {typeof item.badge === 'number' && (
              <span className="ml-1.5 rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] text-white/70">
                {item.badge}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

export interface TabPanelProps {
  id: string
  activeId: string
  className?: string
  /** Keep mounted while hidden instead of unmounting (preserves form field registration). */
  keepMounted?: boolean
  children: React.ReactNode
}

export function TabPanel({ id, activeId, className, keepMounted = false, children }: TabPanelProps) {
  const active = id === activeId
  if (!active && !keepMounted) return null
  return (
    <div
      role="tabpanel"
      id={`tabpanel-${id}`}
      aria-labelledby={`tab-${id}`}
      hidden={!active}
      className={className}
    >
      {children}
    </div>
  )
}
