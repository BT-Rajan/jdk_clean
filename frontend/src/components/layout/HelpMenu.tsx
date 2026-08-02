import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Avatar } from '@/components/ui'
import type { User } from '@/types/auth'
import { HELP_CONTENT } from '@/lib/helpContent'

interface HelpMenuProps {
  user: User
  avatarVersion: number
}

/**
 * Profile trigger (avatar + name, links to /profile as before) with a
 * role-based Help & Guide flyout pinned next to it. Opens on hover (desktop)
 * or on tap of the small "?" badge (touch/keyboard) -- matches NavDropdown's
 * open/close/outside-click/Escape behavior for a consistent feel.
 */
export function HelpMenu({ user, avatarVersion }: HelpMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function openNow() {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    setIsOpen(true)
  }

  function closeSoon() {
    closeTimer.current = setTimeout(() => setIsOpen(false), 150)
  }

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

  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
  }, [])

  const sections = HELP_CONTENT[user.role]

  return (
    <div ref={containerRef} className="relative" onMouseEnter={openNow} onMouseLeave={closeSoon}>
      <div className="flex items-center gap-2">
        <Link
          to="/profile"
          className="flex items-center gap-3 rounded-xl px-2 py-1 transition-colors hover:bg-white/5"
        >
          <div className="hidden text-right sm:block">
            <p className="text-sm font-medium text-white">{user.full_name}</p>
            <p className="text-xs tracking-wide text-gold-300/80 capitalize">{user.role}</p>
          </div>
          <Avatar key={avatarVersion} avatarUrl={user.avatar_url} name={user.full_name} size="sm" />
        </Link>
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          aria-haspopup="true"
          aria-expanded={isOpen}
          aria-label="Help"
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-gold-400/30 bg-gold-500/10 text-[10px] font-bold text-gold-200 transition-colors hover:bg-gold-500/20"
        >
          ?
        </button>
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="glass-panel-header-scrolled absolute right-0 top-[calc(100%+0.5rem)] z-50 max-h-[75vh] w-80 overflow-y-auto rounded-xl p-4 sm:w-96"
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="font-display text-sm font-medium text-white">Help &amp; Guide</p>
              <span className="text-xs tracking-wide text-gold-300/80 capitalize">{user.role}</span>
            </div>

            {sections ? (
              <div className="flex flex-col gap-4">
                {sections.map((section) => (
                  <div key={section.title}>
                    <p className="text-xs font-semibold tracking-wide text-gold-300 uppercase">{section.title}</p>
                    <ul className="mt-1.5 flex flex-col gap-2">
                      {section.items.map((item) => (
                        <li key={item.title} className="text-xs text-white/80">
                          <span className="font-medium text-white/90">{item.title}</span>
                          <ul className="mt-0.5 ml-3 list-disc space-y-0.5 text-white/60">
                            {item.steps.map((step, i) => (
                              <li key={i}>{step}</li>
                            ))}
                          </ul>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-white/50">A guide for this role is coming soon.</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
