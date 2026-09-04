import type { ReactNode } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { Avatar, Logo, Button } from '@/components/ui'
import { AssistantDrawer } from '@/components/assistant/AssistantDrawer'
import { CommandPalette } from '@/components/command-palette/CommandPalette'
import type { PaletteAction } from '@/components/command-palette/CommandPalette'
import { useAuth } from '@/hooks/useAuth'
import { isAdmin } from '@/lib/roles'
import { getPageKeyForPath } from '@/lib/pagePermissions'
import { MASTER_DATA_REGISTRY } from '@/lib/masterDataRegistry'
import { cn } from '@/lib/cn'
import { AmbientBackground } from './AmbientBackground'
import { Breadcrumbs } from './Breadcrumbs'
import { CalendarModal } from './CalendarModal'
import { NavDropdown } from './NavDropdown'
import { NotificationsModal } from './NotificationsModal'
import { listNotifications } from '@/api/notifications'
import type { Notification } from '@/types/notification'
import { getApiErrorMessage } from '@/lib/apiError'

interface AppLayoutProps {
  children: ReactNode
}

interface NavLeaf {
  to: string
  label: string
}

interface NavGroup {
  label: string
  items: NavLeaf[]
}

type NavEntry = NavLeaf | NavGroup

function isNavGroup(entry: NavEntry): entry is NavGroup {
  return 'items' in entry
}

export function AppLayout({ children }: AppLayoutProps) {
  const { user, permissions, logoutUser, avatarVersion } = useAuth()
  const navigate = useNavigate()
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [isScrolled, setIsScrolled] = useState(false)
  const [isAssistantOpen, setIsAssistantOpen] = useState(false)
  const [isCalendarOpen, setIsCalendarOpen] = useState(false)
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false)
  const [isPaletteOpen, setIsPaletteOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [notifLoading, setNotifLoading] = useState(true)
  const [notifError, setNotifError] = useState<string | null>(null)

  // Real notifications, polled from the database -- not a mock list. A
  // 60s interval keeps the bell's badge reasonably current without
  // hammering the endpoint; opening the modal doesn't need its own
  // separate fetch since the payload is small and already fresh enough.
  useEffect(() => {
    if (!user) return
    let cancelled = false
    function fetchNotifications() {
      listNotifications()
        .then((res) => {
          if (!cancelled) {
            setNotifications(res.items)
            setNotifError(null)
          }
        })
        .catch((err) => {
          if (!cancelled) setNotifError(getApiErrorMessage(err))
        })
        .finally(() => {
          if (!cancelled) setNotifLoading(false)
        })
    }
    fetchNotifications()
    const interval = setInterval(fetchNotifications, 60_000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [user])

  // The header is sticky, so once the page scrolls, content passes directly
  // behind it continuously. Track scroll position and swap to a near-solid
  // background + firmer shadow at that point so scrolling content never
  // visually blends/"jumbles" with the header text and nav above it.
  useEffect(() => {
    function handleScroll() {
      setIsScrolled(window.scrollY > 8)
    }
    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // Global Cmd/Ctrl+K launcher for the command palette -- works from
  // anywhere in the app, not just when a search box happens to be
  // focused.
  useEffect(() => {
    if (!user) return
    function onKeydown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setIsPaletteOpen(true)
      }
    }
    window.addEventListener('keydown', onKeydown)
    return () => window.removeEventListener('keydown', onKeydown)
  }, [user])

  const navEntries: NavEntry[] = [
    { to: '/dashboard', label: 'Dashboard' },
    {
      label: 'Sales',
      items: [
        { to: '/feasibilities', label: 'Feasibility checks' },
        { to: '/quotations', label: 'Quotations' },
        { to: '/orders', label: 'Orders' },
        { to: '/delivery-notes', label: 'Delivery notes' },
      ],
    },
    {
      label: 'Purchasing',
      items: [
        { to: '/purchase-orders', label: 'Purchase orders' },
        { to: '/supplier-returns', label: 'Supplier returns' },
      ],
    },
    {
      label: 'Inventory',
      items: [{ to: '/inventory', label: 'Stock levels' }],
    },
    {
      label: 'Production',
      items: [
        { to: '/production', label: 'Production schedule' },
        { to: '/mrp', label: 'MRP' },
      ],
    },
    ...(isAdmin(user?.role) ? [{ to: '/admin', label: 'Admin' } satisfies NavLeaf] : []),
  ]

  // Hides a nav link/group the user's department has no access to at
  // all -- PagePermissionGuard already blocks direct navigation to a
  // denied page, this just keeps the link from showing in the first
  // place. While permissions are still loading (null), show everything
  // rather than flash an empty nav that fills in a moment later --
  // the route guard is what actually protects content either way.
  function isPathVisible(to: string): boolean {
    const pageKey = getPageKeyForPath(to)
    if (pageKey === null) return true
    if (!permissions) return true
    return permissions[pageKey] !== undefined && permissions[pageKey] !== 'none'
  }

  const visibleNavEntries: NavEntry[] = navEntries.flatMap<NavEntry>((entry) => {
    if (!isNavGroup(entry)) {
      return isPathVisible(entry.to) ? [entry] : []
    }
    const visibleItems = entry.items.filter((item) => isPathVisible(item.to))
    return visibleItems.length > 0 ? [{ ...entry, items: visibleItems }] : []
  })

  // Master Data entries the user can actually reach -- mirrors
  // MasterDataHomePage's own visibility rule so the palette never offers
  // a page that 403s. Kept separate from visibleNavEntries since these
  // aren't in the nav bar itself (Master Data lives under Admin, see
  // AdminShell's "Master Data" group), but should still be one Cmd/Ctrl+K
  // search away.
  function isMasterEntryVisible(entry: (typeof MASTER_DATA_REGISTRY)[number]): boolean {
    if (entry.adminOnly) return isAdmin(user?.role)
    if (!entry.pageKey) return true
    if (!permissions) return true
    return permissions[entry.pageKey] !== undefined && permissions[entry.pageKey] !== 'none'
  }

  // Every visible nav destination, plus the header's quick actions --
  // the single list the command palette searches/navigates. Built from
  // the exact same visibleNavEntries the nav bar renders, so a page
  // never shows up in one place but not the other.
  const paletteActions: PaletteAction[] = [
    ...visibleNavEntries.flatMap((entry) =>
      isNavGroup(entry)
        ? entry.items.map((item) => ({
            id: `nav:${item.to}`,
            label: item.label,
            hint: entry.label,
            onSelect: () => navigate(item.to),
          }))
        : [{ id: `nav:${entry.to}`, label: entry.label, onSelect: () => navigate(entry.to) }],
    ),
    ...MASTER_DATA_REGISTRY.filter(isMasterEntryVisible).map((entry) => ({
      id: `master-data:${entry.key}`,
      label: entry.label,
      hint: 'Master Data',
      onSelect: () => navigate(entry.route),
    })),
    { id: 'action:calendar', label: 'Open Calendar', keywords: 'schedule events', onSelect: () => setIsCalendarOpen(true) },
    { id: 'action:notifications', label: 'Open Notifications', keywords: 'alerts bell', onSelect: () => setIsNotificationsOpen(true) },
    { id: 'action:assistant', label: 'Open AI Assistant', keywords: 'ai chat help', onSelect: () => setIsAssistantOpen(true) },
    { id: 'action:profile', label: 'My Profile', onSelect: () => navigate('/profile') },
    { id: 'action:logout', label: 'Sign out', keywords: 'logout', onSelect: handleLogout },
    ...(isAdmin(user?.role)
      ? [
          {
            id: 'admin:company',
            label: 'Company',
            hint: 'Admin',
            keywords: 'factory setup working hours weekdays',
            onSelect: () => navigate('/admin?section=company'),
          },
          { id: 'admin:workflow-automation', label: 'Workflow Automation', hint: 'Admin', onSelect: () => navigate('/admin?section=workflow-automation') },
          { id: 'admin:approvals', label: 'Approvals', hint: 'Admin', onSelect: () => navigate('/admin?section=approvals') },
          { id: 'admin:ai-assistant', label: 'AI Assistant settings', hint: 'Admin', keywords: 'api key', onSelect: () => navigate('/admin?section=ai-assistant') },
          {
            id: 'admin:communication',
            label: 'Communication',
            hint: 'Admin',
            keywords: 'email whatsapp sms imap pop3 smtp meta templates kwtsms unifonic smsala',
            onSelect: () => navigate('/admin?section=communication'),
          },
          { id: 'admin:org-chart', label: 'Org Chart', hint: 'Admin', onSelect: () => navigate('/admin?section=org-chart') },
          { id: 'admin:master-data', label: 'Master Data', hint: 'Admin', onSelect: () => navigate('/master-data') },
          // Users, Departments, and Roles & Permissions are covered by
          // the Master Data entries above now -- not duplicated here.
        ]
      : []),
  ]

  async function handleLogout() {
    setIsLoggingOut(true)
    try {
      await logoutUser()
    } finally {
      navigate('/login', { replace: true })
    }
  }

  return (
    <div className="relative min-h-screen">
      <AmbientBackground />

      <header
        className={cn(
          'sticky top-0 z-50 mx-4 mt-4 flex flex-col gap-3 rounded-2xl px-5 py-3 transition-[background-color,box-shadow] duration-300 sm:mx-6 sm:px-6 lg:mx-8 xl:mx-12',
          isScrolled ? 'glass-panel-header-scrolled' : 'glass-panel-header',
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-y-2">
          <Logo />

          <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-4">
            {user && (
              <button
                type="button"
                onClick={() => setIsPaletteOpen(true)}
                aria-label="Search (Cmd+K)"
                className="flex w-10 items-center gap-2 rounded-xl border border-white/10 px-2.5 py-2 text-white/40 transition-colors hover:border-white/20 hover:text-white/60 sm:w-48 sm:justify-start md:w-64 lg:w-80"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="shrink-0">
                  <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.6" />
                  <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
                <span className="hidden flex-1 truncate text-left text-sm sm:inline">Search…</span>
                <kbd className="hidden shrink-0 rounded-md border border-white/10 px-1.5 py-0.5 text-[10px] text-white/30 sm:inline">⌘K</kbd>
              </button>
            )}
            {user && (
              <button
                type="button"
                onClick={() => setIsCalendarOpen(true)}
                aria-label="Calendar"
                className="flex items-center justify-center rounded-xl border border-white/10 p-2 text-white/40 transition-colors hover:border-white/20 hover:text-white/60"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.6" />
                  <path d="M3 9.5h18" stroke="currentColor" strokeWidth="1.6" />
                  <path d="M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </button>
            )}
            {user && (
              <button
                type="button"
                onClick={() => setIsNotificationsOpen(true)}
                aria-label="Notifications"
                className="relative flex items-center justify-center rounded-xl border border-white/10 p-2 text-white/40 transition-colors hover:text-white/60 hover:border-white/20"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M13.73 21a2 2 0 0 1-3.46 0"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                {notifications.length > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white">
                    {notifications.length > 9 ? '9+' : notifications.length}
                  </span>
                )}
              </button>
            )}
            {user && (
              <button
                type="button"
                onClick={() => setIsAssistantOpen(true)}
                className="flex items-center gap-1.5 rounded-xl border border-gold-400/30 bg-gold-500/10 px-3 py-1.5 text-sm font-medium text-gold-200 transition-colors hover:bg-gold-500/20"
                aria-label="Open JDK Assistant"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M12 2a5 5 0 0 1 5 5v1a5 5 0 0 1-2 4v2a3 3 0 0 1-3 3h-1v2h-2v-2H8a3 3 0 0 1-3-3v-2a5 5 0 0 1-2-4V7a5 5 0 0 1 5-5h4Z"
                    stroke="currentColor"
                    strokeWidth="1.6"
                  />
                  <circle cx="9.5" cy="9.5" r="1" fill="currentColor" />
                  <circle cx="14.5" cy="9.5" r="1" fill="currentColor" />
                </svg>
                <span className="hidden sm:inline">AI</span>
              </button>
            )}
            {user && (
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
            )}
            <Button variant="ghost" size="sm" isLoading={isLoggingOut} onClick={handleLogout}>
              Sign out
            </Button>
          </div>
        </div>

        <nav className="flex flex-wrap gap-1">
          {visibleNavEntries.map((entry) =>
            isNavGroup(entry) ? (
              <NavDropdown key={entry.label} label={entry.label} items={entry.items} />
            ) : (
              <NavLink
                key={entry.to}
                to={entry.to}
                className={({ isActive }) =>
                  cn(
                    'whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                    isActive ? 'bg-gold-500/15 text-gold-200' : 'text-white/50 hover:text-white',
                  )
                }
              >
                {entry.label}
              </NavLink>
            ),
          )}
        </nav>
      </header>

      <main className="relative z-10 mx-auto max-w-[1920px] px-4 pt-6 pb-10 sm:px-6 lg:px-8 xl:px-12">
        <Breadcrumbs />
        {children}
      </main>

      {user && (
        <>
          <CommandPalette open={isPaletteOpen} onClose={() => setIsPaletteOpen(false)} actions={paletteActions} />
          <AssistantDrawer open={isAssistantOpen} onClose={() => setIsAssistantOpen(false)} />
          <CalendarModal open={isCalendarOpen} onClose={() => setIsCalendarOpen(false)} />
          <NotificationsModal
            open={isNotificationsOpen}
            onClose={() => setIsNotificationsOpen(false)}
            notifications={notifications}
            loading={notifLoading}
            error={notifError}
          />
        </>
      )}
    </div>
  )
}
