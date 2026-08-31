import type { ReactNode } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'
import { PageContainer } from '@/components/layout/PageContainer'
import { GlassCard } from '@/components/ui'

/**
 * The one create/edit page chrome every master's form used to redefine
 * locally (11 near-identical copies -- AppLayout > PageContainer > h1 >
 * GlassCard, sometimes with an `after` slot for a HistoryTimeline). The
 * fields inside stay hand-written per master -- that part is genuinely
 * domain-specific and isn't what was duplicated.
 */
export function MasterFormShell({
  title,
  children,
  after,
}: {
  title: string
  children: ReactNode
  after?: ReactNode
}) {
  return (
    <AppLayout>
      <PageContainer>
        <h1 className="font-display text-2xl font-medium text-white">{title}</h1>
        <GlassCard className="mt-8 p-8">{children}</GlassCard>
        {after}
      </PageContainer>
    </AppLayout>
  )
}
