import { Link } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { GlassCard, Button } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { useDashboardPreferences } from '@/hooks/useDashboardPreferences'
import { useState } from 'react'

export function DashboardCustomizePage() {
  const { user } = useAuth()
  const { preferences, getAvailableWidgets, updateWidgetEnabled } = useDashboardPreferences(user?.role)
  const [hasChanges, setHasChanges] = useState(false)

  const availableWidgets = getAvailableWidgets()

  const handleToggleWidget = (widgetId: string, enabled: boolean) => {
    updateWidgetEnabled(widgetId, !enabled)
    setHasChanges(true)
  }

  return (
    <AppLayout>
      <div className="flex items-center gap-3">
        <Link to="/dashboard" className="text-gold-300 hover:text-gold-200">
          ← Dashboard
        </Link>
      </div>

      <h1 className="mt-4 font-display text-3xl font-medium text-white">Customize Dashboard</h1>
      <p className="mt-2 text-sm text-white/50">
        Choose which widgets you want to see on your dashboard. You can enable or disable them anytime.
      </p>

      <GlassCard className="mt-8 p-8">
        <div className="mb-6">
          <p className="text-xs tracking-wide text-gold-300/80 capitalize">Your Role</p>
          <p className="mt-1 text-lg font-medium text-white capitalize">{user?.role}</p>
        </div>

        <div className="border-t border-white/10 pt-6">
          <h2 className="mb-4 text-lg font-medium text-white">Available Widgets</h2>
          <p className="mb-6 text-sm text-white/50">
            {availableWidgets.length} widget{availableWidgets.length !== 1 ? 's' : ''} available for your role
          </p>

          <div className="space-y-3">
            {availableWidgets.map((widget) => {
              const isEnabled = preferences?.widgets.find((w) => w.id === widget.id)?.enabled ?? widget.enabled
              return (
                <label key={widget.id} className="flex items-center gap-4 rounded-lg border border-white/10 p-4 transition-colors hover:border-white/20 hover:bg-white/5 cursor-pointer group">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={isEnabled}
                      onChange={(e) => handleToggleWidget(widget.id, isEnabled)}
                      className="h-5 w-5 rounded border-gold-400/30 bg-gold-500/10 accent-gold-400 cursor-pointer"
                    />
                    <div>
                      <p className="font-medium text-white group-hover:text-gold-200">{widget.title}</p>
                      <p className="text-xs text-white/40 capitalize">
                        {widget.type === 'stats' ? '📊 Statistics' : '📈 Graph'}
                      </p>
                    </div>
                  </div>
                  <div className="ml-auto flex items-center gap-2">
                    {isEnabled ? (
                      <span className="inline-flex items-center rounded-full bg-green-500/10 px-2.5 py-0.5 text-xs font-medium text-green-300 border border-green-500/20">
                        Enabled
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-white/5 px-2.5 py-0.5 text-xs font-medium text-white/40 border border-white/10">
                        Disabled
                      </span>
                    )}
                  </div>
                </label>
              )
            })}
          </div>
        </div>

        {hasChanges && (
          <div className="mt-6 rounded-lg border border-gold-400/20 bg-gold-500/5 p-4">
            <p className="text-sm text-gold-200">
              ✓ Your changes have been saved automatically to your local preferences.
            </p>
          </div>
        )}

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link to="/dashboard" className="flex-1">
            <Button variant="secondary" className="w-full">
              Back to Dashboard
            </Button>
          </Link>
        </div>
      </GlassCard>

      <div className="mt-6 rounded-lg border border-white/10 bg-white/5 p-4">
        <h3 className="font-medium text-white">About Dashboard Widgets</h3>
        <ul className="mt-3 space-y-2 text-sm text-white/60">
          <li>• <strong>Statistics Widgets</strong> show key metrics and KPIs for your role</li>
          <li>• <strong>Graph Widgets</strong> display trends and comparisons</li>
          <li>• You can customize which widgets appear on your dashboard</li>
          <li>• Your preferences are saved locally on this device</li>
        </ul>
      </div>
    </AppLayout>
  )
}
