import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface PageContainerProps {
  children: ReactNode
  className?: string
}

/**
 * Standard wrapper for every form page in the app (customers, suppliers,
 * raw materials, products, users, inventory adjustments, orders,
 * quotations).
 *
 * Deliberately does NOT set its own max-width. It used to (first
 * max-w-2xl vs max-w-3xl split three ways across pages, then a single
 * max-w-3xl everywhere), but that meant forms were always some
 * separately-maintained width narrower than list/detail pages, which
 * fill AppLayout's <main> (max-w-5xl) directly -- exactly the "search
 * results are wider, forms are narrower" gap being fixed here. Forms now
 * fill that same <main> width with no extra constraint of their own, so
 * there's no second number to keep in sync and no way for the two to
 * drift apart again. This component stays as the one place every form
 * page hooks into that shared layout, in case a shared treatment is
 * ever needed again.
 */
export function PageContainer({ children, className }: PageContainerProps) {
  return <div className={cn('mx-auto', className)}>{children}</div>
}
