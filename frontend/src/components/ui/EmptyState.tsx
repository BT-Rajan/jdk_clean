import type { ReactNode } from 'react'

interface EmptyStateProps {
  title: string
  message?: string
  action?: ReactNode
}

export function EmptyState({ title, message, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <p className="text-sm font-medium text-white/70">{title}</p>
      {message && <p className="mt-1.5 max-w-sm text-sm text-white/40">{message}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}
