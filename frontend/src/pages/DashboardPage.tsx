import { Link } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { Avatar, GlassCard, Button } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { getDashboardConfig } from '@/lib/dashboardConfig'
import { useDashboardPreferences } from '@/hooks/useDashboardPreferences'
import { StatsWidget, GraphWidget, SkeletonWidget } from '@/components/dashboard/DashboardWidgets'

// Mock data generators for demo
function generateMockStats(widgetId: string) {
  const data: Record<string, { value: string | number; unit?: string; trend?: { value: number; isPositive: boolean } }> = {
    'sales-total': { value: 234, trend: { value: 12, isPositive: true } },
    'sales-revenue': { value: '₹45.2L', unit: 'lakhs', trend: { value: 8, isPositive: true } },
    'sales-pending': { value: 18, trend: { value: -5, isPositive: false } },
    'po-total': { value: 89, trend: { value: 3, isPositive: true } },
    'po-pending': { value: 12, trend: { value: 2, isPositive: false } },
    'suppliers-count': { value: 28, trend: { value: 1, isPositive: true } },
    'stock-items': { value: 2456, trend: { value: 5, isPositive: true } },
    'stock-value': { value: '₹125.4L', unit: 'lakhs', trend: { value: 10, isPositive: true } },
    'low-stock': { value: 34, trend: { value: 8, isPositive: false } },
    'production-orders': { value: 12, trend: { value: 15, isPositive: true } },
    'production-completion': { value: '94%', trend: { value: 4, isPositive: true } },
    'production-delayed': { value: 2, trend: { value: -100, isPositive: true } },
    'total-users': { value: 24, trend: { value: 2, isPositive: true } },
    'orders-total': { value: 892, trend: { value: 11, isPositive: true } },
    'revenue-total': { value: '₹487.3L', unit: 'lakhs', trend: { value: 18, isPositive: true } },
  }
  return data[widgetId] || { value: '—' }
}

function generateMockGraph(widgetId: string) {
  const data: Record<string, Array<{ label: string; value: number }>> = {
    'sales-trend': [
      { label: 'Week 1', value: 32 },
      { label: 'Week 2', value: 45 },
      { label: 'Week 3', value: 38 },
      { label: 'Week 4', value: 52 },
    ],
    'customers-graph': [
      { label: 'ABC Corp', value: 45 },
      { label: 'XYZ Ltd', value: 38 },
      { label: 'Tech Industries', value: 32 },
      { label: 'Others', value: 28 },
    ],
    'po-trend': [
      { label: 'Jan', value: 24 },
      { label: 'Feb', value: 19 },
      { label: 'Mar', value: 28 },
      { label: 'Apr', value: 23 },
    ],
    'suppliers-graph': [
      { label: 'Supplier A', value: 92 },
      { label: 'Supplier B', value: 78 },
      { label: 'Supplier C', value: 85 },
      { label: 'Supplier D', value: 68 },
    ],
    'stock-movement': [
      { label: 'Inbound', value: 234 },
      { label: 'Outbound', value: 189 },
      { label: 'Production', value: 156 },
    ],
    'inventory-breakdown': [
      { label: 'Raw Materials', value: 45 },
      { label: 'Semi-finished', value: 28 },
      { label: 'Finished Goods', value: 27 },
    ],
    'production-timeline': [
      { label: 'On Schedule', value: 9 },
      { label: 'At Risk', value: 2 },
      { label: 'Delayed', value: 1 },
    ],
    'mrp-graph': [
      { label: 'Required', value: 340 },
      { label: 'Available', value: 289 },
      { label: 'Shortage', value: 51 },
    ],
    'system-health': [
      { label: 'Database', value: 99 },
      { label: 'API', value: 98 },
      { label: 'Cache', value: 97 },
    ],
    'all-orders-trend': [
      { label: 'Q1', value: 234 },
      { label: 'Q2', value: 289 },
      { label: 'Q3', value: 267 },
      { label: 'Q4', value: 312 },
    ],
    'module-usage': [
      { label: 'Sales', value: 45 },
      { label: 'Inventory', value: 38 },
      { label: 'Production', value: 32 },
      { label: 'Purchasing', value: 28 },
    ],
  }
  return data[widgetId] || []
}

export function DashboardPage() {
  const { user, avatarVersion } = useAuth()
  const dashboardConfig = getDashboardConfig(user?.role)
  const { preferences, isLoading, getEnabledWidgets } = useDashboardPreferences(user?.role)

  const enabledWidgets = getEnabledWidgets()

  return (
    <AppLayout>
      <h1 className="font-display text-3xl font-medium text-white">
        Welcome, <span className="text-gradient-gold">{user?.full_name}</span>
      </h1>
      <p className="mt-2 text-sm text-white/50">You're signed in to the JDK ERP workspace.</p>

      <GlassCard className="mt-8 p-8">
        <div className="flex items-start justify-between gap-4">
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
          <Link to="/profile">
            <button className="text-sm font-medium text-gold-300 transition-colors hover:text-gold-200">
              Profile →
            </button>
          </Link>
        </div>
      </GlassCard>

      {/* Dashboard Widgets */}
      {!isLoading && enabledWidgets.length > 0 && (
        <div className="mt-8">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="font-display text-xl font-medium text-white">Your Dashboard</h2>
            <Link to="/dashboard/customize">
              <button className="text-sm font-medium text-gold-300 transition-colors hover:text-gold-200">
                Customize →
              </button>
            </Link>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {enabledWidgets.map((widget) => {
              if (widget.type === 'stats') {
                const stats = generateMockStats(widget.id)
                return (
                  <StatsWidget
                    key={widget.id}
                    title={widget.title}
                    value={stats.value}
                    unit={stats.unit}
                    trend={stats.trend}
                  />
                )
              } else {
                const graphData = generateMockGraph(widget.id)
                return <GraphWidget key={widget.id} title={widget.title} data={graphData} />
              }
            })}
          </div>
        </div>
      )}

      {isLoading && (
        <div className="mt-8">
          <h2 className="mb-6 font-display text-xl font-medium text-white">Loading Dashboard...</h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <SkeletonWidget key={i} type={i % 2 === 0 ? 'graph' : 'stats'} />
            ))}
          </div>
        </div>
      )}

      {!isLoading && enabledWidgets.length === 0 && (
        <GlassCard className="mt-8 p-8 text-center">
          <p className="text-white/60">No widgets enabled on your dashboard</p>
          <Link to="/dashboard/customize">
            <Button className="mt-4">Customize Dashboard</Button>
          </Link>
        </GlassCard>
      )}

      {/* Quick Access Section */}
      <div className="mt-8">
        <h2 className="mb-4 font-display text-xl font-medium text-white">Quick Access</h2>
        <div className="grid gap-6">
          {dashboardConfig.sections.map((section) => (
            <GlassCard key={section.id} className="p-6">
              <h3 className="mb-4 text-lg font-medium text-white">{section.title}</h3>
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
      </div>
    </AppLayout>
  )
}
