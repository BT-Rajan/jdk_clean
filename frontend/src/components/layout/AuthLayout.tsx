import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { Logo } from '@/components/ui'
import { AmbientBackground } from './AmbientBackground'

interface AuthLayoutProps {
  title: string
  subtitle?: string
  children: ReactNode
}

export function AuthLayout({ title, subtitle, children }: AuthLayoutProps) {
  return (
    <div className="relative flex min-h-screen w-full items-center justify-center px-4 py-10 sm:px-6 lg:px-10">
      <AmbientBackground />

      <div className="grid w-full max-w-5xl grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-16">
        {/* Brand panel -- hidden on small screens to keep the login flow
            focused there; the card alone carries the branding via <Logo>. */}
        <motion.div
          initial={{ opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="hidden flex-col lg:flex"
        >
          <Logo className="mb-10" />
          <h1 className="font-display text-4xl leading-[1.15] font-medium text-white sm:text-5xl">
            Precision manufacturing,
            <br />
            <span className="text-gradient-gold">run beautifully.</span>
          </h1>
          <p className="mt-6 max-w-md text-[15px] leading-relaxed text-white/50">
            Orders, quotations, bills of material, and inventory in one
            tightly connected workspace -- built for the people who keep the
            floor running.
          </p>

          <div className="mt-14 flex items-center gap-6 text-xs tracking-[0.2em] text-white/30 uppercase">
            <span>Encrypted sessions</span>
            <span className="h-1 w-1 rounded-full bg-white/20" />
            <span>Role-based access</span>
            <span className="h-1 w-1 rounded-full bg-white/20" />
            <span>Full audit trail</span>
          </div>
        </motion.div>

        {/* Form panel */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut', delay: 0.1 }}
          className="mx-auto w-full max-w-md"
        >
          <div className="mb-8 flex flex-col items-center gap-6 lg:hidden">
            <Logo />
          </div>

          <div className="glass-panel-strong rounded-3xl p-8 sm:p-10">
            <div className="mb-8">
              <h2 className="font-display text-2xl font-medium text-white">{title}</h2>
              {subtitle && <p className="mt-2 text-sm text-white/50">{subtitle}</p>}
            </div>
            {children}
          </div>
        </motion.div>
      </div>
    </div>
  )
}
