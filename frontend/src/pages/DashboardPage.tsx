import { Link } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { Avatar, GlassCard } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'

export function DashboardPage() {
  const { user, avatarVersion } = useAuth()

  return (
    <AppLayout>
      <h1 className="font-display text-3xl font-medium text-white">
        Welcome, <span className="text-gradient-gold">{user?.full_name}</span>
      </h1>
      <p className="mt-2 text-sm text-white/50">You're signed in to the JDK ERP workspace.</p>

      <GlassCard className="mt-8 p-8">
        <div className="flex items-center gap-5">
          {user && (
            <Avatar key={avatarVersion} avatarUrl={user.avatar_url} name={user.full_name} size="md" />
          )}
          <div>
            <p className="text-lg font-medium text-white">{user?.full_name}</p>
            <p className="text-sm text-white/50">{user?.email}</p>
            <p className="mt-1 text-xs tracking-wide text-gold-300/80 capitalize">{user?.role}</p>
          </div>
        </div>

        <Link
          to="/profile"
          className="mt-6 inline-block text-sm font-medium text-gold-300 transition-colors hover:text-gold-200"
        >
          View profile →
        </Link>
      </GlassCard>

      <p className="mt-8 text-center text-xs text-white/30">
        Orders, quotations, inventory, and BOM management are on their way here next.
      </p>
    </AppLayout>
  )
}
