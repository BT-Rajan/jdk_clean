import type { ReactNode } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { Avatar, Logo, Button } from '@/components/ui'
import { AssistantDrawer } from '@/components/assistant/AssistantDrawer'
import { useAuth } from '@/hooks/useAuth'
import { isAdmin } from '@/lib/roles'
import { getPageKeyForPath } from '@/lib/pagePermissions'
import { cn } from '@/lib/cn'
import { AmbientBackground } from './AmbientBackground'
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
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false)
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

  const navEntries: NavEntry[] = [
    { to: '/dashboard', label: 'Dashboard' },
    {
      label: 'Sales',
      items: [
        { to: '/customers', label: 'Customers' },
        { to: '/feasibilities', label: 'Feasibility checks' },
        { to: '/quotations', label: 'Quotations' },
        { to: '/orders', label: 'Orders' },
        { to: '/delivery-notes', label: 'Delivery notes' },
      ],
    },
    {
      label: 'Purchasing',
      items: [
        { to: '/suppliers', label: 'Suppliers' },
        { to: '/purchase-orders', label: 'Purchase orders' },
      ],
    },
    {
      label: 'Inventory',
      items: [
        { to: '/raw-materials', label: 'Raw materials' },
        { to: '/products', label: 'Products' },
        { to: '/inventory', label: 'Stock levels' },
      ],
    },
    {
      label: 'Production',
      items: [
        { to: '/production', label: 'Schedule' },
        { to: '/machines', label: 'Machines' },
        { to: '/factory-setup', label: 'Factory setup' },
        { to: '/mrp', label: 'MRP' },
      ],
    },
    ...(isAdmin(user?.role)
      ? [
          {
            label: 'Admin',
            items: [
              { to: '/users', label: 'Users' },
              { to: '/settings', label: 'Settings' },
            ],
          } satisfies NavGroup,
        ]
      : []),
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
          'sticky top-0 z-50 mx-4 mt-4 flex flex-col gap-3 rounded-2xl px-5 py-3 transition-[background-color,box-shadow] duration-300 sm:mx-6 sm:px-6',
          isScrolled ? 'glass-panel-header-scrolled' : 'glass-panel-header',
        )}
      >
        <div className="flex items-center justify-between">
          <Logo />

          <div className="flex items-center gap-4">
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

      <main className="relative z-10 mx-auto max-w-5xl px-4 pt-32 pb-10 sm:px-6">{children}</main>

      {user && (
        <>
          <AssistantDrawer open={isAssistantOpen} onClose={() => setIsAssistantOpen(false)} />
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
