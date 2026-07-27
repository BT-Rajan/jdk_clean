import { Spinner } from '@/components/ui'
import { AmbientBackground } from './AmbientBackground'

export function FullScreenLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <AmbientBackground />
      <Spinner size={28} className="text-gold-300" />
    </div>
  )
}
