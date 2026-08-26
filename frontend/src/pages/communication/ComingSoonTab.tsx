import { GlassCard } from '@/components/ui'

export function ComingSoonTab({ channel }: { channel: string }) {
  return (
    <GlassCard className="mt-6 p-8 text-center">
      <h2 className="font-display text-lg font-medium text-white">{channel}</h2>
      <p className="mt-2 text-sm text-white/50">This channel isn't set up yet.</p>
    </GlassCard>
  )
}
