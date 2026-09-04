import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { cn } from '@/lib/cn'

export interface NavDropdownItem {
  to: string
  label: string
}

interface NavDropdownProps {
  label: string
  items: NavDropdownItem[]
}

/** A single top-level nav entry that expands into a panel of related links.
 *  Groups the flat, ever-growing top nav into a handful of labeled buckets. */
export function NavDropdown({ label, items }: NavDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const location = useLocation()
  const currentPath = location.pathname + location.search

  // Some items in the same dropdown can share a base path but differ
  // only by query string (e.g. several Admin entries all point at
  // /admin?section=...) -- react-router's own NavLink match ignores the
  // search string, which would light up every one of them at once. Query-
  // bearing links need an exact pathname+search match instead; plain
  // ones keep the usual "this page or a page under it" match.
  function isItemActive(to: string): boolean {
    if (to.includes('?')) return currentPath === to
    return location.pathname === to || location.pathname.startsWith(`${to}/`)
  }

  const isGroupActive = items.some((item) => isItemActive(item.to))

  // Close on outside click, on Escape, and whenever the route changes.
  useEffect(() => {
    if (!isOpen) return

    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsOpen(false)
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  useEffect(() => {
    setIsOpen(false)
  }, [location.pathname])

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="true"
        aria-expanded={isOpen}
        className={cn(
          'flex items-center gap-1 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
          isGroupActive || isOpen ? 'bg-gold-500/15 text-gold-200' : 'text-white/50 hover:text-white',
        )}
      >
        {label}
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          className={cn('transition-transform duration-200', isOpen && 'rotate-180')}
        >
          <path
            d="M2.5 4.5 6 8l3.5-3.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="glass-panel-header-scrolled absolute left-0 top-[calc(100%+0.5rem)] z-50 min-w-48 overflow-hidden rounded-xl p-1.5"
          >
            {items.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  'block whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isItemActive(item.to) ? 'bg-gold-500/15 text-gold-200' : 'text-white/60 hover:bg-white/5 hover:text-white',
                )}
              >
                {item.label}
              </Link>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
