import { Link } from 'react-router-dom'
import { AmbientBackground } from '@/components/layout/AmbientBackground'
import { GlassCard } from '@/components/ui'

export function NotFoundPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center px-4">
      <AmbientBackground />
      <GlassCard strong className="max-w-sm p-10 text-center">
        <p className="font-display text-5xl text-gradient-gold">404</p>
        <p className="mt-3 text-sm text-white/50">This page doesn't exist.</p>
        <Link
          to="/"
          className="mt-6 inline-block text-sm font-medium text-gold-300 hover:text-gold-200"
        >
          ← Back home
        </Link>
      </GlassCard>
    </div>
  )
}
