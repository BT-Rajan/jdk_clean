import type { ReactNode } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { Avatar, Logo, Button } from '@/components/ui'
import { AssistantDrawer } from '@/components/assistant/AssistantDrawer'
import { useAuth } from '@/hooks/useAuth'
import { isAdmin } from '@/lib/roles'
import { cn } from '@/lib/cn'
import { AmbientBackground } from './AmbientBackground'
import { NavDropdown } from './NavDropdown'

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
  const { user, logoutUser, avatarVersion } = useAuth()
  const navigate = useNavigate()
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [isScrolled, setIsScrolled] = useState(false)
  const [isAssistantOpen, setIsAssistantOpen] = useState(false)

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
        { to: '/production', label: 'Production' },
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
          'sticky top-4 z-40 mx-4 mt-4 flex flex-col gap-3 rounded-2xl px-5 py-3 transition-[background-color,box-shadow] duration-300 sm:mx-6 sm:px-6',
          isScrolled ? 'glass-panel-header-scrolled' : 'glass-panel-header',
        )}
      >
        <div className="flex items-center justify-between">
          <Logo />

          <div className="flex items-center gap-4">
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
          {navEntries.map((entry) =>
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

      <main className="relative z-0 mx-auto max-w-5xl px-4 py-10 sm:px-6">{children}</main>

      {user && (
        <AssistantDrawer open={isAssistantOpen} onClose={() => setIsAssistantOpen(false)} />
      )}
    </div>
  )
}
