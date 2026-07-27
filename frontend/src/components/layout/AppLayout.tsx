import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { Logo, Button } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { AmbientBackground } from './AmbientBackground'

interface AppLayoutProps {
  children: ReactNode
}

export function AppLayout({ children }: AppLayoutProps) {
  const { user, logoutUser } = useAuth()
  const navigate = useNavigate()
  const [isLoggingOut, setIsLoggingOut] = useState(false)

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

      <header className="glass-panel sticky top-4 z-10 mx-4 mt-4 flex items-center justify-between rounded-2xl px-5 py-3 sm:mx-6 sm:px-6">
        <Logo />

        <div className="flex items-center gap-4">
          {user && (
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium text-white">{user.full_name}</p>
              <p className="text-xs tracking-wide text-gold-300/80 capitalize">{user.role}</p>
            </div>
          )}
          <Button variant="ghost" size="sm" isLoading={isLoggingOut} onClick={handleLogout}>
            Sign out
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">{children}</main>
    </div>
  )
}
