import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface PageContainerProps {
  children: ReactNode
  className?: string
}

/**
 * Standard wrapper for every form page in the app (customers, suppliers,
 * raw materials, products, users, inventory adjustments, orders,
 * quotations). AppLayout's <main> is already max-w-5xl, which list and
 * detail pages fill directly -- but a single column of form fields
 * stretched to 1024px looks lost, so forms narrow further. That
 * narrowing used to be a hand-written `mx-auto max-w-2xl` (or, on Orders
 * and Quotations, `max-w-3xl` for their line-item tables) repeated
 * separately in every form page, so the exact width silently drifted
 * between pages with no reason a user could see. This component is now
 * the single place that width lives: every form page uses the same
 * value, including the line-item ones, which just get a bit more
 * breathing room than they strictly need rather than a different width
 * than everything else.
 */
export function PageContainer({ children, className }: PageContainerProps) {
  return <div className={cn('mx-auto max-w-3xl', className)}>{children}</div>
}
