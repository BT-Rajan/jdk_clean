import { GlassCard } from '@/components/ui/GlassCard'

export function NoPageAccessPage() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <GlassCard className="max-w-md p-8 text-center">
        <h1 className="font-display text-xl font-medium text-white">No access to this page</h1>
        <p className="mt-3 text-sm text-white/60">
          Your department hasn't been granted access to this page yet. Ask an admin to grant it from Settings →
          Access Control.
        </p>
      </GlassCard>
    </div>
  )
}
