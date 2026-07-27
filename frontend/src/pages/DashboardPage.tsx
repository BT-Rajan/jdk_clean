import { Link } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { GlassCard } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'

export function DashboardPage() {
  const { user } = useAuth()

  return (
    <AppLayout>
      <h1 className="font-display text-3xl font-medium text-white">
        Welcome, <span className="text-gradient-gold">{user?.full_name}</span>
      </h1>
      <p className="mt-2 text-sm text-white/50">You're signed in to the JDK ERP workspace.</p>

      <GlassCard className="mt-8 p-8">
        <h2 className="text-xs font-medium tracking-[0.14em] text-white/50 uppercase">
          Account
        </h2>
        <dl className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-white/40">Username</dt>
            <dd className="mt-1 text-[15px] text-white">{user?.username}</dd>
          </div>
          <div>
            <dt className="text-xs text-white/40">Email</dt>
            <dd className="mt-1 text-[15px] text-white">{user?.email}</dd>
          </div>
          <div>
            <dt className="text-xs text-white/40">Role</dt>
            <dd className="mt-1 text-[15px] text-white capitalize">{user?.role}</dd>
          </div>
          <div>
            <dt className="text-xs text-white/40">Status</dt>
            <dd className="mt-1 text-[15px] text-white">
              {user?.is_active ? 'Active' : 'Inactive'}
            </dd>
          </div>
        </dl>

        <Link
          to="/change-password"
          className="mt-8 inline-block text-sm font-medium text-gold-300 transition-colors hover:text-gold-200"
        >
          Change password →
        </Link>
      </GlassCard>

      <p className="mt-8 text-center text-xs text-white/30">
        Orders, quotations, inventory, and BOM management are on their way here next.
      </p>
    </AppLayout>
  )
}
