import { Link } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { Avatar, GlassCard } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { getDashboardConfig } from '@/lib/dashboardConfig'

export function DashboardPage() {
  const { user, avatarVersion } = useAuth()
  const dashboardConfig = getDashboardConfig(user?.role)

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

      {/* Role-based Dashboard Sections */}
      <div className="mt-8 grid gap-6">
        {dashboardConfig.sections.map((section) => (
          <GlassCard key={section.id} className="p-6">
            <h2 className="mb-4 text-lg font-medium text-white">{section.title}</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {section.items.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className="group rounded-lg border border-gold-400/20 bg-gold-500/5 p-4 transition-all hover:bg-gold-500/10 hover:border-gold-400/40"
                >
                  <p className="text-sm font-medium text-gold-200 group-hover:text-gold-100">{item.label}</p>
                  {item.description && (
                    <p className="mt-1 text-xs text-white/40 group-hover:text-white/50">{item.description}</p>
                  )}
                </Link>
              ))}
            </div>
          </GlassCard>
        ))}
      </div>
    </AppLayout>
  )
}
