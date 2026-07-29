import type { ReactNode } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { Avatar, Logo, Button } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { isAdmin } from '@/lib/roles'
import { cn } from '@/lib/cn'
import { AmbientBackground } from './AmbientBackground'

interface AppLayoutProps {
  children: ReactNode
}

interface NavItem {
  to: string
  label: string
}

export function AppLayout({ children }: AppLayoutProps) {
  const { user, logoutUser, avatarVersion } = useAuth()
  const navigate = useNavigate()
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [isScrolled, setIsScrolled] = useState(false)

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

  const navItems: NavItem[] = [
    { to: '/dashboard', label: 'Dashboard' },
    { to: '/customers', label: 'Customers' },
    { to: '/suppliers', label: 'Suppliers' },
    { to: '/raw-materials', label: 'Raw materials' },
    { to: '/products', label: 'Products' },
    { to: '/inventory', label: 'Inventory' },
    { to: '/production', label: 'Production' },
    { to: '/mrp', label: 'MRP' },
    { to: '/quotations', label: 'Quotations' },
    { to: '/orders', label: 'Orders' },
    ...(isAdmin(user?.role) ? [{ to: '/users', label: 'Users' }] : []),
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

        <nav className="flex gap-1 overflow-x-auto pb-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                  isActive ? 'bg-gold-500/15 text-gold-200' : 'text-white/50 hover:text-white',
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="relative z-0 mx-auto max-w-5xl px-4 py-10 sm:px-6">{children}</main>
    </div>
  )
}
